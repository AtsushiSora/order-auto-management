import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://atsushisora.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);
const sourceBucket = "order-auto-private";
const backupBucket = "order-auto-backups";

type BackupAction = "create" | "restore" | "delete" | "save_to_drive";
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

const googleRequest = async (url: string, accessToken: string, init: RequestInit) => {
  const result = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!result.ok) {
    let detail = "";
    try {
      const body = await result.json() as { error?: { message?: unknown } };
      detail = typeof body.error?.message === "string" ? body.error.message : "";
    } catch {
      // GoogleからJSON以外の応答が来た場合はHTTP状態を使用する。
    }
    if (result.status === 401) throw new Error("Google Driveの接続期限が切れました。もう一度Googleへ接続してください。");
    throw new Error(detail || `Google Driveへ保存できませんでした（${result.status}）。`);
  }
  return result;
};

const uploadToGoogleDrive = async (
  accessToken: string,
  parentId: string,
  name: string,
  mimeType: string,
  file: Blob,
) => {
  const boundary = `order_auto_${crypto.randomUUID().replaceAll("-", "")}`;
  const metadata = JSON.stringify({ name, mimeType, parents: [parentId] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  return googleRequest(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    accessToken,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
  );
};

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

  let input: { action?: unknown; backupId?: unknown; mode?: unknown; googleAccessToken?: unknown };
  try {
    input = await request.json();
  } catch {
    return response(responseOrigin, { error: "入力内容を確認してください。" }, 400);
  }
  const action = typeof input.action === "string" ? input.action as BackupAction : "";
  if (!new Set<BackupAction>(["create", "restore", "delete", "save_to_drive"]).has(action as BackupAction)) {
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

    if (action === "save_to_drive") {
      const googleAccessToken = typeof input.googleAccessToken === "string" ? input.googleAccessToken.trim() : "";
      if (!googleAccessToken || googleAccessToken.length > 4096) {
        return response(responseOrigin, { error: "Google Driveへ接続し直してください。" }, 400);
      }
      const { data: backup, error: backupError } = await admin
        .from("system_backups")
        .select("id, row_count, payload, attachment_file_count, attachment_total_bytes, attachment_backup_status, created_at")
        .eq("id", backupId)
        .single();
      if (backupError || !backup) throw backupError ?? new Error("バックアップが見つかりません。");
      if (!["none", "complete"].includes(backup.attachment_backup_status)) {
        return response(responseOrigin, { error: "添付ファイルまで保全済みの新しいバックアップを選択してください。" }, 409);
      }

      const createdAt = new Date(backup.created_at);
      const timestamp = createdAt.toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
      const folderName = `ORDER AUTO バックアップ_${timestamp}`;
      const folderResult = await googleRequest(
        "https://www.googleapis.com/drive/v3/files?fields=id,webViewLink",
        googleAccessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            appProperties: { orderAutoBackupId: backupId },
          }),
        },
      );
      const folder = await folderResult.json() as { id?: unknown; webViewLink?: unknown };
      const folderId = typeof folder.id === "string" ? folder.id : "";
      const folderUrl = typeof folder.webViewLink === "string" ? folder.webViewLink : `https://drive.google.com/drive/folders/${folderId}`;
      if (!folderId) throw new Error("Google Driveの保存先フォルダを作成できませんでした。");

      const manifest = new Blob([JSON.stringify({
        format: "order-auto-system-backup",
        version: 2,
        id: backup.id,
        createdAt: backup.created_at,
        rowCount: backup.row_count,
        attachmentFileCount: backup.attachment_file_count,
        attachmentTotalBytes: backup.attachment_total_bytes,
        payload: backup.payload,
      }, null, 2)], { type: "application/json" });
      await uploadToGoogleDrive(googleAccessToken, folderId, `order-auto-backup_${timestamp}.json`, "application/json", manifest);

      const attachments = Array.isArray(backup.payload?.attachments)
        ? backup.payload.attachments as (AttachmentRow & { original_file_name?: string })[]
        : [];
      let uploadedFileCount = 0;
      for (const attachment of attachments) {
        const { data: file, error: fileError } = await admin.storage
          .from(backupBucket)
          .download(backupObjectPath(backupId, attachment.id));
        if (fileError || !file) throw new Error("保全済みの添付ファイルを読み込めませんでした。");
        const originalName = typeof attachment.original_file_name === "string" && attachment.original_file_name.trim()
          ? attachment.original_file_name.trim()
          : `attachment-${attachment.id}`;
        const safeName = originalName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
        await uploadToGoogleDrive(
          googleAccessToken,
          folderId,
          `${attachment.id.slice(0, 8)}_${safeName}`,
          attachment.mime_type,
          file,
        );
        uploadedFileCount += 1;
      }

      const savedAt = new Date().toISOString();
      const { error: updateError } = await admin
        .from("system_backups")
        .update({ drive_folder_id: folderId, drive_folder_url: folderUrl, drive_saved_at: savedAt })
        .eq("id", backupId);
      if (updateError) throw updateError;
      return response(responseOrigin, { success: true, folderUrl, uploadedFileCount, savedAt });
    }

    await removeBackupFiles(admin, backupId);
    const { error: deleteError } = await userClient.rpc("delete_system_backup", { p_backup_id: backupId });
    if (deleteError) throw deleteError;
    return response(responseOrigin, { success: true });
  } catch (reason) {
    const detail = reason && typeof reason === "object" && "message" in reason ? reason.message : null;
    const message = reason instanceof Error
      ? reason.message
      : typeof detail === "string" && detail.trim()
        ? detail
        : "バックアップ処理に失敗しました。";
    return response(responseOrigin, { error: message }, 500);
  }
});
