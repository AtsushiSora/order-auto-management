-- 本番でそのまま実行しないでください。
-- 1. Supabase Dashboard > Authentication > Users で事業主のメール利用者を作成する。
-- 2. 下記 UUID を、その利用者の実際の auth.users.id へ置き換える。
-- 3. SQL Editor で1回だけ実行する。パスワードやメールアドレスはこのファイルへ書かない。

insert into public.staff_profiles (id, display_name, role, is_active)
values ('00000000-0000-0000-0000-000000000000', '事業主', 'owner', true);

