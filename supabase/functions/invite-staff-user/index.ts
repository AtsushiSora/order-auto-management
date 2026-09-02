import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://atsushisora.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);
const allowedRoles = new Set(["accounting", "regular", "spot"]);

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
    return response(responseOrigin, { error: "この画面からは招待できません。" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    return response(responseOrigin, { error: "ログイン状態を確認できません。" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userResult.user) {
    return response(responseOrigin, { error: "ログインし直してください。" }, 401);
  }

  const { data: caller } = await admin
    .from("staff_profiles")
    .select("role, is_active")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (!caller?.is_active || caller.role !== "owner") {
    return response(responseOrigin, { error: "利用者を招待できるのは事業主だけです。" }, 403);
  }

  let input: { email?: unknown; displayName?: unknown; role?: unknown };
  try {
    input = await request.json();
  } catch {
    return response(responseOrigin, { error: "入力内容を確認してください。" }, 400);
  }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const role = typeof input.role === "string" ? input.role : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response(responseOrigin, { error: "正しいメールアドレスを入力してください。" }, 400);
  }
  if (!displayName || displayName.length > 80 || !allowedRoles.has(role)) {
    return response(responseOrigin, { error: "表示名と権限を確認してください。" }, 400);
  }

  const redirectTo = requestOrigin === "https://atsushisora.github.io"
    ? "https://atsushisora.github.io/order-auto-management/"
    : `${requestOrigin || "http://localhost:5173"}/`;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { display_name: displayName, requested_role: role },
  });
  if (inviteError || !invited.user) {
    const duplicate = /already|registered|exists/i.test(inviteError?.message ?? "");
    return response(responseOrigin, {
      error: duplicate ? "このメールアドレスはすでに登録されています。" : "招待メールを送信できませんでした。",
    }, duplicate ? 409 : 500);
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    id: invited.user.id,
    display_name: displayName,
    role,
    is_active: true,
    deactivated_at: null,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return response(responseOrigin, { error: "社内利用者として登録できませんでした。" }, 500);
  }

  return response(responseOrigin, { success: true, staffId: invited.user.id });
});
