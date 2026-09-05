-- 社員番号、在籍情報、本人情報、免許証の非公開保存。

do $$
begin
  if not exists (select 1 from pg_type where typname = 'staff_employment_status') then
    create type public.staff_employment_status as enum ('active', 'paused', 'retired');
  end if;
end
$$;

alter table public.staff_profiles
  add column if not exists employee_number integer,
  add column if not exists employment_status public.staff_employment_status not null default 'active',
  add column if not exists last_name text,
  add column if not exists first_name text,
  add column if not exists last_name_kana text,
  add column if not exists first_name_kana text,
  add column if not exists postal_code text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists birth_date date,
  add column if not exists license_front_path text,
  add column if not exists license_back_path text,
  add column if not exists license_expiry date,
  add column if not exists profile_completed_at timestamptz;

update public.staff_profiles
set employment_status = case when is_active then 'active'::public.staff_employment_status else 'paused'::public.staff_employment_status end;

-- 導入前からいる利用者を締め出さない。詳細は設定画面から後で補完できる。
update public.staff_profiles
set profile_completed_at = coalesce(profile_completed_at, now());

create sequence if not exists public.staff_employee_number_seq;

with ranked as (
  select id, row_number() over (order by created_at asc, id asc)::integer as seq
  from public.staff_profiles
)
update public.staff_profiles as staff
set employee_number = ranked.seq
from ranked
where staff.id = ranked.id
  and staff.employee_number is null;

do $$
declare
  v_max integer;
begin
  select max(employee_number) into v_max from public.staff_profiles;
  if v_max is null then
    perform setval('public.staff_employee_number_seq', 1, false);
  else
    perform setval('public.staff_employee_number_seq', v_max, true);
  end if;
end
$$;

alter sequence public.staff_employee_number_seq owned by public.staff_profiles.employee_number;
alter table public.staff_profiles alter column employee_number set default nextval('public.staff_employee_number_seq');
alter table public.staff_profiles alter column employee_number set not null;
create unique index if not exists staff_profiles_employee_number_key on public.staff_profiles(employee_number);
revoke all on sequence public.staff_employee_number_seq from public, anon, authenticated;

comment on column public.staff_profiles.employee_number is '登録順に自動採番する変更不可の社員番号。画面では4桁表示する。';
comment on column public.staff_profiles.employment_status is 'active=在籍、paused=休止、retired=退職。';
comment on column public.staff_profiles.profile_completed_at is '招待後の本人情報登録が完了した日時。';

grant update (employment_status) on public.staff_profiles to authenticated;

create or replace function public.save_staff_profile_details(
  p_staff_id uuid,
  p_last_name text,
  p_first_name text,
  p_last_name_kana text,
  p_first_name_kana text,
  p_postal_code text,
  p_address text,
  p_phone text,
  p_birth_date date,
  p_license_front_path text,
  p_license_back_path text,
  p_license_expiry date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean := private.has_role(array['owner']::public.staff_role[]);
  v_expected_prefix text := 'staff-licenses/' || p_staff_id::text || '/';
begin
  if p_staff_id is null or not exists (select 1 from public.staff_profiles where id = p_staff_id) then
    raise exception '対象のスタッフが見つかりません。';
  end if;
  if auth.uid() is distinct from p_staff_id and not v_is_owner then
    raise exception 'このスタッフ情報は変更できません。';
  end if;
  if not private.is_active_staff() then
    raise exception '現在利用できるスタッフではありません。';
  end if;
  if char_length(trim(coalesce(p_last_name, ''))) not between 1 and 80
     or char_length(trim(coalesce(p_first_name, ''))) not between 1 and 80 then
    raise exception '名字と名前を入力してください。';
  end if;
  if char_length(trim(coalesce(p_last_name_kana, ''))) not between 1 and 100
     or char_length(trim(coalesce(p_first_name_kana, ''))) not between 1 and 100 then
    raise exception 'フリガナを入力してください。';
  end if;
  if trim(coalesce(p_postal_code, '')) !~ '^\d{3}-?\d{4}$'
     or char_length(trim(coalesce(p_address, ''))) < 1 then
    raise exception '住所と郵便番号を確認してください。';
  end if;
  if regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') !~ '^0\d{9,10}$' then
    raise exception '電話番号を確認してください。';
  end if;
  if p_birth_date is null or p_birth_date > current_date then
    raise exception '生年月日を確認してください。';
  end if;
  if p_license_expiry is null then
    raise exception '運転免許証の有効期限を入力してください。';
  end if;
  if coalesce(p_license_front_path, '') not like v_expected_prefix || '%'
     or coalesce(p_license_back_path, '') not like v_expected_prefix || '%' then
    raise exception '運転免許証画像を表・裏とも登録してください。';
  end if;

  update public.staff_profiles
  set display_name = trim(p_last_name) || ' ' || trim(p_first_name),
      last_name = trim(p_last_name),
      first_name = trim(p_first_name),
      last_name_kana = trim(p_last_name_kana),
      first_name_kana = trim(p_first_name_kana),
      postal_code = trim(p_postal_code),
      address = trim(p_address),
      phone = trim(p_phone),
      birth_date = p_birth_date,
      license_front_path = p_license_front_path,
      license_back_path = p_license_back_path,
      license_expiry = p_license_expiry,
      profile_completed_at = coalesce(profile_completed_at, now())
  where id = p_staff_id;
end;
$$;

revoke all on function public.save_staff_profile_details(uuid, text, text, text, text, text, text, text, date, text, text, date) from public, anon;
grant execute on function public.save_staff_profile_details(uuid, text, text, text, text, text, text, text, date, text, text, date) to authenticated;

-- 免許証フォルダだけは本人と事業主以外から見えないよう、既存の包括ポリシーを絞る。
drop policy if exists order_auto_private_read on storage.objects;
create policy order_auto_private_read
on storage.objects for select to authenticated
using (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and ((storage.foldername(name))[1] <> 'staff-licenses' or private.has_role(array['owner']::public.staff_role[]))
);

drop policy if exists order_auto_private_update on storage.objects;
create policy order_auto_private_update
on storage.objects for update to authenticated
using (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular']::public.staff_role[])
  and (storage.foldername(name))[1] <> 'staff-licenses'
)
with check (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular']::public.staff_role[])
  and (storage.foldername(name))[1] <> 'staff-licenses'
);

create policy order_auto_staff_license_read
on storage.objects for select to authenticated
using (
  bucket_id = 'order-auto-private'
  and (storage.foldername(name))[1] = 'staff-licenses'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or private.has_role(array['owner']::public.staff_role[])
  )
);

create policy order_auto_staff_license_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-auto-private'
  and (storage.foldername(name))[1] = 'staff-licenses'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or private.has_role(array['owner']::public.staff_role[])
  )
);

create policy order_auto_staff_license_update
on storage.objects for update to authenticated
using (
  bucket_id = 'order-auto-private'
  and (storage.foldername(name))[1] = 'staff-licenses'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or private.has_role(array['owner']::public.staff_role[])
  )
)
with check (
  bucket_id = 'order-auto-private'
  and (storage.foldername(name))[1] = 'staff-licenses'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or private.has_role(array['owner']::public.staff_role[])
  )
);
