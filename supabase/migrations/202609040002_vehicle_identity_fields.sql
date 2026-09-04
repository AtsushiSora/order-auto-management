-- 車両名の入力ゆれを防ぐため、メーカー・車種・グレード等を独立して保存する。

alter table public.vehicles
  add column if not exists maker text not null default '',
  add column if not exists model text not null default '',
  add column if not exists grade text not null default '',
  add column if not exists model_type text,
  add column if not exists registration_number text,
  add column if not exists first_registration text,
  add column if not exists inspection_expiry date,
  add column if not exists body_color text,
  add column if not exists mileage text;

update public.vehicles
set
  maker = coalesce(nullif(btrim(maker), ''), nullif(btrim(public_maker), ''), ''),
  model = coalesce(nullif(btrim(model), ''), nullif(btrim(name), ''), ''),
  grade = coalesce(nullif(btrim(grade), ''), nullif(btrim(public_grade), ''), '')
where maker = '' or model = '' or grade = '';

create table if not exists public.vehicle_model_options (
  id uuid primary key default gen_random_uuid(),
  maker text not null check (char_length(btrim(maker)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 100),
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maker, model)
);

alter table public.vehicle_model_options enable row level security;

drop policy if exists vehicle_model_options_staff_read on public.vehicle_model_options;
create policy vehicle_model_options_staff_read on public.vehicle_model_options
for select to authenticated
using (private.has_role(array['owner', 'regular', 'spot', 'accounting']::public.staff_role[]));

drop policy if exists vehicle_model_options_operations_insert on public.vehicle_model_options;
create policy vehicle_model_options_operations_insert on public.vehicle_model_options
for insert to authenticated
with check (private.has_role(array['owner', 'regular']::public.staff_role[]));

drop policy if exists vehicle_model_options_owner_update on public.vehicle_model_options;
create policy vehicle_model_options_owner_update on public.vehicle_model_options
for update to authenticated
using (private.has_role(array['owner']::public.staff_role[]))
with check (private.has_role(array['owner']::public.staff_role[]));

drop policy if exists vehicle_model_options_owner_delete on public.vehicle_model_options;
create policy vehicle_model_options_owner_delete on public.vehicle_model_options
for delete to authenticated
using (private.has_role(array['owner']::public.staff_role[]));

insert into public.vehicle_model_options (maker, model, created_by, updated_by)
select
  coalesce(nullif(btrim(v.maker), ''), 'その他'),
  btrim(v.model),
  v.created_by,
  v.updated_by
from public.vehicles v
where nullif(btrim(v.model), '') is not null
on conflict (maker, model) do nothing;

create or replace function public.apply_vehicle_inspection_import_v2(
  p_vehicle_id uuid,
  p_vehicle_name text default null,
  p_chassis_number text default null,
  p_registration_number text default null,
  p_registered_owner_name text default null,
  p_first_registration text default null,
  p_inspection_expiry text default null,
  p_model_type text default null
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

  if not exists (select 1 from public.vehicles where id = p_vehicle_id and deleted_at is null) then
    raise exception '対象車両が見つかりません。' using errcode = 'P0002';
  end if;

  update public.vehicles
  set
    name = coalesce(nullif(btrim(p_vehicle_name), ''), name),
    model = coalesce(nullif(btrim(p_vehicle_name), ''), model),
    chassis_number = coalesce(nullif(btrim(p_chassis_number), ''), chassis_number),
    registration_number = coalesce(nullif(btrim(p_registration_number), ''), registration_number),
    first_registration = coalesce(nullif(btrim(p_first_registration), ''), first_registration),
    inspection_expiry = coalesce(nullif(btrim(p_inspection_expiry), '')::date, inspection_expiry),
    model_type = coalesce(nullif(btrim(p_model_type), ''), model_type),
    updated_by = auth.uid()
  where id = p_vehicle_id;

  insert into public.antique_ledger_details (vehicle_id, registration_number, registered_owner_name)
  values (
    p_vehicle_id,
    coalesce(nullif(btrim(p_registration_number), ''), ''),
    coalesce(nullif(btrim(p_registered_owner_name), ''), '')
  )
  on conflict (vehicle_id) do update set
    registration_number = coalesce(nullif(excluded.registration_number, ''), public.antique_ledger_details.registration_number),
    registered_owner_name = coalesce(nullif(excluded.registered_owner_name, ''), public.antique_ledger_details.registered_owner_name),
    updated_by = auth.uid();
end;
$$;

revoke all on function public.apply_vehicle_inspection_import_v2(uuid, text, text, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.apply_vehicle_inspection_import_v2(uuid, text, text, text, text, text, text, text)
to authenticated;
