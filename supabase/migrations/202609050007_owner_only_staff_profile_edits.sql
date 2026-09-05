-- 本人によるスタッフ情報の保存は初回登録だけに限定する。
-- 登録完了後の修正、免許証画像の差し替えは事業主だけが行う。

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
  v_profile_completed_at timestamptz;
  v_expected_prefix text := 'staff-licenses/' || p_staff_id::text || '/';
begin
  select profile_completed_at
  into v_profile_completed_at
  from public.staff_profiles
  where id = p_staff_id;

  if p_staff_id is null or not found then
    raise exception '対象のスタッフが見つかりません。';
  end if;
  if not private.is_active_staff() then
    raise exception '現在利用できるスタッフではありません。';
  end if;
  if not v_is_owner and (
    auth.uid() is distinct from p_staff_id
    or v_profile_completed_at is not null
  ) then
    raise exception 'スタッフ情報を変更できるのは事業主だけです。';
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

drop policy if exists order_auto_staff_license_insert on storage.objects;
create policy order_auto_staff_license_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-auto-private'
  and (storage.foldername(name))[1] = 'staff-licenses'
  and (
    private.has_role(array['owner']::public.staff_role[])
    or (
      (storage.foldername(name))[2] = auth.uid()::text
      and exists (
        select 1
        from public.staff_profiles
        where id = auth.uid()
          and is_active = true
          and profile_completed_at is null
      )
    )
  )
);

drop policy if exists order_auto_staff_license_update on storage.objects;
create policy order_auto_staff_license_update
on storage.objects for update to authenticated
using (
  bucket_id = 'order-auto-private'
  and (storage.foldername(name))[1] = 'staff-licenses'
  and (
    private.has_role(array['owner']::public.staff_role[])
    or (
      (storage.foldername(name))[2] = auth.uid()::text
      and exists (
        select 1 from public.staff_profiles
        where id = auth.uid() and is_active = true and profile_completed_at is null
      )
    )
  )
)
with check (
  bucket_id = 'order-auto-private'
  and (storage.foldername(name))[1] = 'staff-licenses'
  and (
    private.has_role(array['owner']::public.staff_role[])
    or (
      (storage.foldername(name))[2] = auth.uid()::text
      and exists (
        select 1 from public.staff_profiles
        where id = auth.uid() and is_active = true and profile_completed_at is null
      )
    )
  )
);
