-- 誤登録・テスト用の退職済み利用者だけを完全削除する。
-- 業務データから参照されている利用者は外部キーを動的に確認して拒否する。

create or replace function public.delete_unused_staff_profile(p_staff_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role;
  v_status public.staff_employment_status;
  v_display_name text;
  v_reference record;
  v_has_reference boolean;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception 'スタッフを削除できるのは事業主だけです。';
  end if;
  if p_staff_id is null or p_staff_id = auth.uid() then
    raise exception 'ログイン中の利用者は削除できません。';
  end if;

  select role, employment_status, display_name
  into v_role, v_status, v_display_name
  from public.staff_profiles
  where id = p_staff_id
  for update;

  if not found then
    raise exception '対象のスタッフが見つかりません。';
  end if;
  if v_role = 'owner' then
    raise exception '事業主アカウントは削除できません。';
  end if;
  if v_status <> 'retired' then
    raise exception '削除する前に在籍情報を「退職」にしてください。';
  end if;

  for v_reference in
    select distinct
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'staff_profiles'
      and ccu.column_name = 'id'
  loop
    if v_reference.table_schema = 'public'
       and v_reference.table_name = 'audit_logs'
       and v_reference.column_name = 'actor_id' then
      execute format(
        'select exists (select 1 from %I.%I where %I = $1 and not (table_name = ''staff_profiles'' and record_id = $1))',
        v_reference.table_schema,
        v_reference.table_name,
        v_reference.column_name
      ) into v_has_reference using p_staff_id;
    else
      execute format(
        'select exists (select 1 from %I.%I where %I = $1)',
        v_reference.table_schema,
        v_reference.table_name,
        v_reference.column_name
      ) into v_has_reference using p_staff_id;
    end if;

    if v_has_reference then
      raise exception '契約・経費・精算などの業務履歴があるため削除できません。「退職」のまま履歴を保存してください。';
    end if;
  end loop;

  -- 初回登録など、対象本人のプロフィール変更だけを記録した監査履歴は個人情報と一緒に消去する。
  delete from public.audit_logs
  where table_name = 'staff_profiles'
    and record_id = p_staff_id;

  delete from public.staff_profiles where id = p_staff_id;
  return v_display_name;
end;
$$;

revoke all on function public.delete_unused_staff_profile(uuid) from public, anon;
grant execute on function public.delete_unused_staff_profile(uuid) to authenticated;
