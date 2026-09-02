import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://atsushisora.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);
const sourceBucket = "order-auto-private";
const backupBucket = "order-auto-backups";

type BackupAction = "create" | "restore" | "delete";
type AttachmentRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
};

const response = (origin: string, body: Record<string, unknown>, status = 200) => new Response(
  status === 204 ? null : JSON.stringify(body),
  {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
    },
  },
);

const backupObjectPath = (backupId: string, attachmentId: string) => `${backupId}/${attachmentId}`;

const removeBackupFiles = async (
  admin: ReturnType<typeof createClient>,
  backupId: string,
) => {
  const paths: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(backupBucket).list(backupId, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const page = data ?? [];
    paths.push(...page.filter((item) => item.id).map((item) => `${backupId}/${item.name}`));
    if (page.length < 1000) break;
    offset += page.length;
  }
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await admin.storage.from(backupBucket).remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
};

Deno.serve(async (request: Request) => {
  const requestOrigin = request.headers.get("Origin") ?? "";
  const responseOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : "https://atsushisora.github.io";
  if (request.method === "OPTIONS") return response(responseOrigin, {}, 204);
  if (request.method !== "POST") return response(responseOrigin, { error: "POSTのみ利用できます。" }, 405);
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return response(responseOrigin, { error: "この画面からは操作できません。" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !accessToken) {
    return response(responseOrigin, { error: "ログイン状態を確認できません。" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userResult.user) {
    return response(responseOrigin, { error: "ログインし直してください。" }, 401);
  }
  // 通常画面と同じログインJWTで権限を確認する。
  // service_role側の接続状態に依存させないことで、実際の画面と判定を一致させる。
  const { data: caller, error: callerError } = await userClient
    .from("staff_profiles")
    .select("role, is_active")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (callerError) {
    return response(responseOrigin, { error: "利用者権限を確認できませんでした。ログインし直してください。" }, 401);
  }
  if (!caller?.is_active || caller.role !== "owner") {
    return response(responseOrigin, { error: "バックアップを操作できるのは事業主だけです。" }, 403);
  }

  let input: { action?: unknown; backupId?: unknown; mode?: unknown };
  try {
    input = await request.json();
  } catch {
    return response(responseOrigin, { error: "入力内容を確認してください。" }, 400);
  }
  const action = typeof input.action === "string" ? input.action as BackupAction : "";
  if (!new Set<BackupAction>(["create", "restore", "delete"]).has(action as BackupAction)) {
    return response(responseOrigin, { error: "バックアップ操作を確認してください。" }, 400);
  }

  try {
    if (action === "create") {
      const { data: created, error: createError } = await userClient.rpc("create_system_backup");
      if (createError || !created) throw createError ?? new Error("バックアップを作成できませんでした。");
      const backup = Array.isArray(created) ? created[0] : created;
      const backupId = String(backup.id);
      const attachments = Array.isArray(backup.payload?.attachments)
        ? backup.payload.attachments as AttachmentRow[]
        : [];
      let copiedCount = 0;
      let copiedBytes = 0;
      const failedNames: string[] = [];

      for (const attachment of attachments) {
        const { data: file, error: downloadError } = await admin.storage
          .from(sourceBucket)
          .download(attachment.storage_path);
        if (downloadError || !file) {
          failedNames.push(attachment.id);
          continue;
        }
        const { error: uploadError } = await admin.storage
          .from(backupBucket)
          .upload(backupObjectPath(backupId, attachment.id), file, {
            contentType: attachment.mime_type,
            upsert: true,
          });
        if (uploadError) {
          failedNames.push(attachment.id);
          continue;
        }
        copiedCount += 1;
        copiedBytes += Number(attachment.byte_size) || file.size;
      }

      const fileStatus = attachments.length === 0
        ? "none"
        : copiedCount === attachments.length
          ? "complete"
          : copiedCount > 0
            ? "partial"
            : "failed";
      const { data: updated, error: updateError } = await admin
        .from("system_backups")
        .update({
          attachment_file_count: copiedCount,
          attachment_total_bytes: copiedBytes,
          attachment_backup_status: fileStatus,
        })
        .eq("id", backupId)
        .select("id, backup_kind, row_count, attachment_file_count, attachment_total_bytes, attachment_backup_status, created_at")
        .single();
      if (updateError) throw updateError;
      return response(responseOrigin, {
        backup: updated,
        warning: failedNames.length ? `${failedNames.length}件の添付ファイルを保全できませんでした。` : null,
      });
    }

    const backupId = typeof input.backupId === "string" ? input.backupId : "";
    if (!/^[0-9a-f-]{36}$/i.test(backupId)) {
      return response(responseOrigin, { error: "バックアップを選択してください。" }, 400);
    }

    if (action === "restore") {
      const mode = input.mode === "replace" ? "replace" : "merge";
      const { data: backup, error: backupError } = await admin
        .from("system_backups")
        .select("payload, attachment_backup_status")
        .eq("id", backupId)
        .single();
      if (backupError || !backup) throw backupError ?? new Error("バックアップが見つかりません。");

      const { error: restoreError } = await userClient.rpc("restore_system_backup", {
        p_backup_id: backupId,
        p_mode: mode,
      });
      if (restoreError) throw restoreError;

      const attachments = Array.isArray(backup.payload?.attachments)
        ? backup.payload.attachments as AttachmentRow[]
        : [];
      let restoredCount = 0;
      let missingCount = 0;
      for (const attachment of attachments) {
        if (mode === "merge") {
          const { data: existing } = await admin.storage.from(sourceBucket).download(attachment.storage_path);
          if (existing) continue;
        }
        const { data: file, error: downloadError } = await admin.storage
          .from(backupBucket)
          .download(backupObjectPath(backupId, attachment.id));
        if (downloadError || !file) {
          missingCount += 1;
          continue;
        }
        const { error: uploadError } = await admin.storage
          .from(sourceBucket)
          .upload(attachment.storage_path, file, {
            contentType: attachment.mime_type,
            upsert: true,
          });
        if (uploadError) {
          missingCount += 1;
          continue;
        }
        restoredCount += 1;
      }
      return response(responseOrigin, {
        success: true,
        restoredFileCount: restoredCount,
        missingFileCount: missingCount,
      });
    }

    await removeBackupFiles(admin, backupId);
    const { error: deleteError } = await userClient.rpc("delete_system_backup", { p_backup_id: backupId });
    if (deleteError) throw deleteError;
    return response(responseOrigin, { success: true });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "バックアップ処理に失敗しました。";
    return response(responseOrigin, { error: message }, 500);
  }
});
