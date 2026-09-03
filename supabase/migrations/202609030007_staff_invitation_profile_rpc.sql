-- 招待したAuth利用者を、ログイン中の事業主だけが社内利用者として登録する。
-- Edge Functionからテーブルへ直接書かず、権限確認を含む専用RPCへ集約する。

create or replace function public.register_invited_staff_profile(
  p_staff_id uuid,
  p_display_name text,
  p_role public.staff_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '社内利用者を登録できるのは事業主だけです。';
  end if;
  if p_staff_id is null or not exists (select 1 from auth.users where id = p_staff_id) then
    raise exception '招待した利用者を確認できません。';
  end if;
  if p_role not in ('accounting', 'regular', 'spot') then
    raise exception '招待時の権限を確認してください。';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception '表示名を1文字以上80文字以内で入力してください。';
  end if;

  insert into public.staff_profiles(id, display_name, role, is_active, deactivated_at)
  values (p_staff_id, trim(p_display_name), p_role, true, null);
end;
$$;

revoke all on function public.register_invited_staff_profile(uuid, text, public.staff_role) from public, anon;
grant execute on function public.register_invited_staff_profile(uuid, text, public.staff_role) to authenticated;
