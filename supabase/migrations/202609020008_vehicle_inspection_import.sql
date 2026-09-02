-- 車検証から確認済みの基本情報だけを、車両と古物台帳へ一括反映する。

create or replace function public.apply_vehicle_inspection_import(
  p_vehicle_id uuid,
  p_vehicle_name text default null,
  p_chassis_number text default null,
  p_registration_number text default null,
  p_registered_owner_name text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '車検証情報を変更する権限がありません。' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.vehicles
    where id = p_vehicle_id and deleted_at is null
  ) then
    raise exception '対象車両が見つかりません。' using errcode = 'P0002';
  end if;

  if nullif(btrim(coalesce(p_vehicle_name, '')), '') is null
    and nullif(btrim(coalesce(p_chassis_number, '')), '') is null
    and nullif(btrim(coalesce(p_registration_number, '')), '') is null
    and nullif(btrim(coalesce(p_registered_owner_name, '')), '') is null then
    raise exception '反映する車検証情報を1項目以上入力してください。';
  end if;

  update public.vehicles
  set
    name = coalesce(nullif(btrim(p_vehicle_name), ''), name),
    chassis_number = coalesce(nullif(btrim(p_chassis_number), ''), chassis_number)
  where id = p_vehicle_id;

  insert into public.antique_ledger_details (
    vehicle_id,
    registration_number,
    registered_owner_name
  ) values (
    p_vehicle_id,
    coalesce(nullif(btrim(p_registration_number), ''), ''),
    coalesce(nullif(btrim(p_registered_owner_name), ''), '')
  )
  on conflict (vehicle_id) do update set
    registration_number = coalesce(
      nullif(excluded.registration_number, ''),
      public.antique_ledger_details.registration_number
    ),
    registered_owner_name = coalesce(
      nullif(excluded.registered_owner_name, ''),
      public.antique_ledger_details.registered_owner_name
    ),
    updated_by = (select auth.uid());
end;
$$;

revoke all on function public.apply_vehicle_inspection_import(uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.apply_vehicle_inspection_import(uuid, text, text, text, text)
to authenticated;
