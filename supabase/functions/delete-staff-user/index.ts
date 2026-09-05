import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://atsushisora.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);

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

Deno.serve(async (request: Request) => {
  const requestOrigin = request.headers.get("Origin") ?? "";
  const responseOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : "https://atsushisora.github.io";
  if (request.method === "OPTIONS") return response(responseOrigin, {}, 204);
  if (request.method !== "POST") return response(responseOrigin, { error: "POSTのみ利用できます。" }, 405);
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return response(responseOrigin, { error: "この画面からは削除できません。" }, 403);
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
  if (userError || !userResult.user) return response(responseOrigin, { error: "ログインし直してください。" }, 401);

  const { data: caller, error: callerError } = await userClient
    .from("staff_profiles")
    .select("role, is_active")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (callerError || !caller?.is_active || caller.role !== "owner") {
    return response(responseOrigin, { error: "スタッフを削除できるのは事業主だけです。" }, 403);
  }

  let input: { staffId?: unknown; confirmation?: unknown };
  try {
    input = await request.json();
  } catch {
    return response(responseOrigin, { error: "削除内容を確認してください。" }, 400);
  }
  const staffId = typeof input.staffId === "string" ? input.staffId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffId)
      || input.confirmation !== "DELETE") {
    return response(responseOrigin, { error: "削除内容を確認してください。" }, 400);
  }

  const { data: deletedName, error: profileError } = await userClient.rpc("delete_unused_staff_profile", {
    p_staff_id: staffId,
  });
  if (profileError) {
    const safeMessages = [
      "スタッフを削除できるのは事業主だけです。",
      "ログイン中の利用者は削除できません。",
      "対象のスタッフが見つかりません。",
      "事業主アカウントは削除できません。",
      "削除する前に在籍情報を「退職」にしてください。",
      "契約・経費・精算などの業務履歴があるため削除できません。「退職」のまま履歴を保存してください。",
    ];
    const safeMessage = safeMessages.find((message) => profileError.message.includes(message));
    return response(responseOrigin, { error: safeMessage ?? "スタッフを安全に削除できませんでした。" }, 409);
  }

  const folder = `staff-licenses/${staffId}`;
  const { data: licenseObjects } = await admin.storage.from("order-auto-private").list(folder, { limit: 100 });
  let storageCleanupWarning = false;
  if (licenseObjects?.length) {
    const { error: storageError } = await admin.storage.from("order-auto-private").remove(licenseObjects.map((item) => `${folder}/${item.name}`));
    storageCleanupWarning = Boolean(storageError);
  }

  const { error: authError } = await admin.auth.admin.deleteUser(staffId);
  if (authError) {
    return response(responseOrigin, {
      error: "スタッフ情報は削除しましたが、ログインアカウントの削除に失敗しました。Supabaseで確認してください。",
    }, 500);
  }

  return response(responseOrigin, { success: true, deletedName, storageCleanupWarning });
});
