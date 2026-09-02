-- スポットスタッフは本人の担当案件だけを閲覧し、担当範囲に応じて紹介登録または契約入力を行う。

create type public.spot_assignment_status as enum ('open', 'completed', 'cancelled');

create table public.spot_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  engagement_type public.staff_engagement_type not null,
  business_type public.staff_business_type not null,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete restrict,
  lead_label text not null default '' check (char_length(lead_label) <= 160),
  referral_note text not null default '' check (char_length(referral_note) <= 1000),
  status public.spot_assignment_status not null default 'open',
  completed_at timestamptz,
  completed_by uuid references public.staff_profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references public.staff_profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spot_assignment_status_consistency check (
    (status = 'open' and completed_at is null and completed_by is null and cancelled_at is null and cancelled_by is null)
    or (status = 'completed' and completed_at is not null and completed_by is not null and cancelled_at is null and cancelled_by is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
  ),
  constraint spot_full_sale_vehicle_required check (
    not (engagement_type = 'full_service' and business_type = 'sale') or vehicle_id is not null
  )
);

create index spot_assignments_staff_idx on public.spot_assignments(staff_id, created_at desc);
create index spot_assignments_vehicle_idx on public.spot_assignments(vehicle_id) where vehicle_id is not null;
create unique index spot_assignments_contract_key on public.spot_assignments(contract_id) where contract_id is not null;

create trigger spot_assignments_set_updated_at before update on public.spot_assignments
for each row execute function private.set_updated_columns();
create trigger spot_assignments_audit after insert or update or delete on public.spot_assignments
for each row execute function private.write_audit_log();

alter table public.spot_assignments enable row level security;
grant select on public.spot_assignments to authenticated;

create policy spot_assignments_management_read
on public.spot_assignments for select to authenticated
using (private.has_role(array['owner', 'accounting']::public.staff_role[]));
create policy spot_assignments_self_read
on public.spot_assignments for select to authenticated
using (private.has_role(array['spot']::public.staff_role[]) and staff_id = (select auth.uid()));

create policy vehicles_spot_assignment_read
on public.vehicles for select to authenticated
using (
  private.has_role(array['spot']::public.staff_role[])
  and deleted_at is null
  and exists (
    select 1 from public.spot_assignments a
    where a.staff_id = (select auth.uid())
      and a.vehicle_id = vehicles.id
      and a.engagement_type = 'full_service'
      and a.status = 'open'
  )
);

create policy contracts_spot_assignment_read
on public.contracts for select to authenticated
using (
  private.has_role(array['spot']::public.staff_role[])
  and deleted_at is null
  and exists (
    select 1 from public.spot_assignments a
    where a.staff_id = (select auth.uid())
      and a.contract_id = contracts.id
  )
);

create or replace function public.save_spot_assignment(
  p_assignment_id uuid,
  p_staff_id uuid,
  p_engagement_type public.staff_engagement_type,
  p_business_type public.staff_business_type,
  p_vehicle_id uuid,
  p_lead_label text,
  p_referral_note text
)
returns public.spot_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare v_assignment public.spot_assignments;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then raise exception '担当案件を登録できるのは事業主だけです。'; end if;
  if not exists (select 1 from public.staff_profiles where id = p_staff_id and role = 'spot' and is_active) then
    raise exception '有効なスポットスタッフを選択してください。';
  end if;
  if p_vehicle_id is not null and not exists (select 1 from public.vehicles where id = p_vehicle_id and deleted_at is null) then
    raise exception '対象車両が見つかりません。';
  end if;
  if p_engagement_type = 'full_service' and p_business_type = 'sale' and p_vehicle_id is null then
    raise exception '販売を全て担当する案件では対象車両が必要です。';
  end if;
  if char_length(coalesce(p_lead_label, '')) > 160 or char_length(coalesce(p_referral_note, '')) > 1000 then
    raise exception '案件名または紹介内容が長すぎます。';
  end if;

  if p_assignment_id is null then
    insert into public.spot_assignments(staff_id, engagement_type, business_type, vehicle_id, lead_label, referral_note)
    values (p_staff_id, p_engagement_type, p_business_type, p_vehicle_id, trim(coalesce(p_lead_label, '')), trim(coalesce(p_referral_note, '')))
    returning * into v_assignment;
  else
    update public.spot_assignments set
      staff_id = p_staff_id,
      engagement_type = p_engagement_type,
      business_type = p_business_type,
      vehicle_id = p_vehicle_id,
      lead_label = trim(coalesce(p_lead_label, '')),
      referral_note = trim(coalesce(p_referral_note, ''))
    where id = p_assignment_id and status = 'open' and contract_id is null
    returning * into v_assignment;
    if not found then raise exception '契約作成前の進行中案件だけ修正できます。'; end if;
  end if;
  return v_assignment;
end;
$$;

create or replace function public.create_spot_referral(
  p_business_type public.staff_business_type,
  p_lead_label text,
  p_referral_note text
)
returns public.spot_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare v_assignment public.spot_assignments;
begin
  if not private.has_role(array['spot']::public.staff_role[]) then raise exception 'スポットスタッフだけが紹介を登録できます。'; end if;
  if char_length(trim(coalesce(p_lead_label, ''))) < 1 then raise exception '紹介先・案件名を入力してください。'; end if;
  if char_length(p_lead_label) > 160 or char_length(coalesce(p_referral_note, '')) > 1000 then raise exception '案件名または紹介内容が長すぎます。'; end if;
  insert into public.spot_assignments(staff_id, engagement_type, business_type, lead_label, referral_note)
  values (auth.uid(), 'referral_only', p_business_type, trim(p_lead_label), trim(coalesce(p_referral_note, '')))
  returning * into v_assignment;
  return v_assignment;
end;
$$;

create or replace function public.update_spot_referral(p_assignment_id uuid, p_lead_label text, p_referral_note text)
returns public.spot_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare v_assignment public.spot_assignments;
begin
  if not private.has_role(array['spot']::public.staff_role[]) then raise exception 'スポットスタッフだけが紹介を修正できます。'; end if;
  if char_length(trim(coalesce(p_lead_label, ''))) < 1 then raise exception '紹介先・案件名を入力してください。'; end if;
  update public.spot_assignments set lead_label = trim(p_lead_label), referral_note = trim(coalesce(p_referral_note, ''))
  where id = p_assignment_id and staff_id = auth.uid() and engagement_type = 'referral_only' and status = 'open'
  returning * into v_assignment;
  if not found then raise exception '修正できる紹介案件が見つかりません。'; end if;
  return v_assignment;
end;
$$;

create or replace function public.finish_spot_assignment(p_assignment_id uuid, p_cancel boolean)
returns public.spot_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare v_assignment public.spot_assignments;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then raise exception '担当案件を完了・取消できるのは事業主だけです。'; end if;
  update public.spot_assignments set
    status = case when p_cancel then 'cancelled'::public.spot_assignment_status else 'completed'::public.spot_assignment_status end,
    completed_at = case when p_cancel then null else now() end,
    completed_by = case when p_cancel then null else auth.uid() end,
    cancelled_at = case when p_cancel then now() else null end,
    cancelled_by = case when p_cancel then auth.uid() else null end
  where id = p_assignment_id and status = 'open'
  returning * into v_assignment;
  if not found then raise exception '進行中の担当案件が見つかりません。'; end if;
  return v_assignment;
end;
$$;

create or replace function public.save_spot_purchase_contract(
  p_assignment_id uuid,
  p_contract_id uuid,
  p_customer_label text,
  p_amount bigint,
  p_status public.contract_status,
  p_contracted_on date,
  p_vehicle_name text,
  p_chassis_number text,
  p_acquisition_source public.acquisition_source,
  p_asking_price bigint,
  p_storage_location text,
  p_planned_arrival_date date,
  p_payment_method public.payment_method
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.spot_assignments;
  v_contract public.contracts;
  v_vehicle_id uuid;
begin
  if not private.has_role(array['spot']::public.staff_role[]) then raise exception 'スポットスタッフ専用の契約処理です。'; end if;
  select * into v_assignment from public.spot_assignments
  where id = p_assignment_id and staff_id = auth.uid() and engagement_type = 'full_service'
    and business_type in ('purchase_auction', 'scrap') and status = 'open' for update;
  if not found then raise exception '買取契約を入力できる担当案件が見つかりません。'; end if;
  if p_contract_id is distinct from v_assignment.contract_id and not (p_contract_id is null and v_assignment.contract_id is null) then
    raise exception '担当案件に紐づく契約だけ変更できます。';
  end if;
  if char_length(trim(coalesce(p_customer_label, ''))) < 1 or char_length(trim(coalesce(p_vehicle_name, ''))) < 1 then
    raise exception 'お客様名と車両名を入力してください。';
  end if;
  if p_amount < 0 or p_asking_price < 0 then raise exception '金額は0円以上で入力してください。'; end if;

  if v_assignment.contract_id is null then
    insert into public.contracts(type, vehicle_id, customer_label, amount, status, contracted_on, vehicle_name, chassis_number,
      acquisition_source, asking_price, storage_location, planned_arrival_date, purchase_payment_method)
    values ('purchase', null, trim(p_customer_label), p_amount,
      case when p_status = 'contracted' then 'draft'::public.contract_status else p_status end,
      p_contracted_on, trim(p_vehicle_name), nullif(trim(coalesce(p_chassis_number, '')), ''), p_acquisition_source,
      p_asking_price, trim(p_storage_location), p_planned_arrival_date, p_payment_method)
    returning * into v_contract;
    update public.spot_assignments set contract_id = v_contract.id where id = v_assignment.id;
  else
    select * into v_contract from public.contracts where id = v_assignment.contract_id and type = 'purchase' and deleted_at is null for update;
    if not found then raise exception '担当案件の買取契約が見つかりません。'; end if;
    if v_contract.status = 'contracted' then raise exception '契約済みの内容は修正できません。'; end if;
    update public.contracts set customer_label = trim(p_customer_label), amount = p_amount,
      status = case when p_status = 'contracted' then status else p_status end, contracted_on = p_contracted_on,
      vehicle_name = trim(p_vehicle_name), chassis_number = nullif(trim(coalesce(p_chassis_number, '')), ''),
      acquisition_source = p_acquisition_source, asking_price = p_asking_price, storage_location = trim(p_storage_location),
      planned_arrival_date = p_planned_arrival_date, purchase_payment_method = p_payment_method
    where id = v_contract.id returning * into v_contract;
  end if;

  if p_status = 'contracted' then
    insert into public.vehicles(name, chassis_number, status, acquisition_source, purchase_price, asking_price, storage_location, planned_arrival_date)
    values (trim(p_vehicle_name), nullif(trim(coalesce(p_chassis_number, '')), ''), 'planned_arrival', p_acquisition_source,
      p_amount, p_asking_price, trim(p_storage_location), p_planned_arrival_date)
    returning id into v_vehicle_id;
    update public.contracts set vehicle_id = v_vehicle_id, status = 'contracted' where id = v_contract.id;
    update public.spot_assignments set vehicle_id = v_vehicle_id where id = v_assignment.id;
    if p_amount > 0 then
      insert into public.cashflows(vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on)
      values (v_vehicle_id, 'outgoing', 'purchase_payment', '買取代金 ' || trim(p_customer_label), p_amount, 0, 'unprocessed', p_payment_method, p_planned_arrival_date);
    end if;
  end if;
  return v_contract.id;
end;
$$;

create or replace function public.save_spot_sale_contract(
  p_assignment_id uuid,
  p_contract_id uuid,
  p_customer_label text,
  p_amount bigint,
  p_status public.contract_status,
  p_contracted_on date,
  p_payment_method public.payment_method
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.spot_assignments;
  v_contract public.contracts;
  v_vehicle public.vehicles;
begin
  if not private.has_role(array['spot']::public.staff_role[]) then raise exception 'スポットスタッフ専用の契約処理です。'; end if;
  select * into v_assignment from public.spot_assignments
  where id = p_assignment_id and staff_id = auth.uid() and engagement_type = 'full_service'
    and business_type = 'sale' and status = 'open' and vehicle_id is not null for update;
  if not found then raise exception '販売契約を入力できる担当案件が見つかりません。'; end if;
  if p_contract_id is distinct from v_assignment.contract_id and not (p_contract_id is null and v_assignment.contract_id is null) then
    raise exception '担当案件に紐づく契約だけ変更できます。';
  end if;
  if char_length(trim(coalesce(p_customer_label, ''))) < 1 then raise exception 'お客様名を入力してください。'; end if;
  if p_amount < 0 or (p_status = 'contracted' and p_amount <= 0) then raise exception '販売金額を確認してください。'; end if;
  select * into v_vehicle from public.vehicles where id = v_assignment.vehicle_id and deleted_at is null for update;
  if not found then raise exception '担当車両が見つかりません。'; end if;

  if v_assignment.contract_id is null then
    insert into public.contracts(type, vehicle_id, customer_label, amount, status, contracted_on, sale_payment_method)
    values ('sale', v_vehicle.id, trim(p_customer_label), p_amount,
      case when p_status = 'contracted' then 'draft'::public.contract_status else p_status end, p_contracted_on, p_payment_method)
    returning * into v_contract;
    update public.spot_assignments set contract_id = v_contract.id where id = v_assignment.id;
  else
    select * into v_contract from public.contracts where id = v_assignment.contract_id and type = 'sale' and deleted_at is null for update;
    if not found then raise exception '担当案件の販売契約が見つかりません。'; end if;
    if v_contract.status = 'contracted' then raise exception '契約済みの内容は修正できません。'; end if;
    update public.contracts set customer_label = trim(p_customer_label), amount = p_amount,
      status = case when p_status = 'contracted' then status else p_status end,
      contracted_on = p_contracted_on, sale_payment_method = p_payment_method
    where id = v_contract.id returning * into v_contract;
  end if;

  if p_status = 'contracted' then
    if v_vehicle.status not in ('arrived', 'for_sale') then raise exception '入庫済みまたは販売中の車両だけ販売契約できます。'; end if;
    update public.vehicles set status = 'reserved', sale_price = p_amount where id = v_vehicle.id;
    update public.contracts set status = 'contracted' where id = v_contract.id;
    insert into public.cashflows(vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on)
    values (v_vehicle.id, 'incoming', 'sale_receipt', '販売代金 ' || trim(p_customer_label), p_amount, 0, 'unprocessed', p_payment_method, p_contracted_on);
  end if;
  return v_contract.id;
end;
$$;

revoke all on function public.save_spot_assignment(uuid, uuid, public.staff_engagement_type, public.staff_business_type, uuid, text, text) from public, anon;
grant execute on function public.save_spot_assignment(uuid, uuid, public.staff_engagement_type, public.staff_business_type, uuid, text, text) to authenticated;
revoke all on function public.create_spot_referral(public.staff_business_type, text, text) from public, anon;
grant execute on function public.create_spot_referral(public.staff_business_type, text, text) to authenticated;
revoke all on function public.update_spot_referral(uuid, text, text) from public, anon;
grant execute on function public.update_spot_referral(uuid, text, text) to authenticated;
revoke all on function public.finish_spot_assignment(uuid, boolean) from public, anon;
grant execute on function public.finish_spot_assignment(uuid, boolean) to authenticated;
revoke all on function public.save_spot_purchase_contract(uuid, uuid, text, bigint, public.contract_status, date, text, text, public.acquisition_source, bigint, text, date, public.payment_method) from public, anon;
grant execute on function public.save_spot_purchase_contract(uuid, uuid, text, bigint, public.contract_status, date, text, text, public.acquisition_source, bigint, text, date, public.payment_method) to authenticated;
revoke all on function public.save_spot_sale_contract(uuid, uuid, text, bigint, public.contract_status, date, public.payment_method) from public, anon;
grant execute on function public.save_spot_sale_contract(uuid, uuid, text, bigint, public.contract_status, date, public.payment_method) to authenticated;
