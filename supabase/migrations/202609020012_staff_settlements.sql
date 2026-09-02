-- 通常／スポットスタッフの紹介料・成果報酬と、例外的な請求の精算履歴。
-- 粗利と条件は登録時点のスナップショットを保存し、車両データ変更では自動変更しない。

create type public.staff_settlement_direction as enum ('pay_staff', 'charge_staff');
create type public.staff_engagement_type as enum ('referral_only', 'full_service');
create type public.staff_business_type as enum ('sale', 'purchase_auction', 'scrap');
create type public.staff_calculation_method as enum ('fixed', 'gross_profit_rate', 'manual');
create type public.staff_settlement_status as enum ('planned', 'confirmed', 'settled', 'cancelled');

alter table public.cashflows
  add column source_staff_settlement_id uuid;

create table public.staff_settlements (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete restrict,
  direction public.staff_settlement_direction not null default 'pay_staff',
  engagement_type public.staff_engagement_type not null,
  business_type public.staff_business_type not null,
  calculation_method public.staff_calculation_method not null,
  gross_profit_basis bigint not null default 0 check (gross_profit_basis >= 0),
  rate_percent numeric(7,3) check (rate_percent is null or (rate_percent > 0 and rate_percent <= 100)),
  planned_amount bigint not null check (planned_amount > 0),
  confirmed_amount bigint check (confirmed_amount is null or confirmed_amount > 0),
  payment_method public.payment_method not null default 'bank_transfer',
  status public.staff_settlement_status not null default 'planned',
  agreement_confirmed boolean not null default false,
  agreement_note text not null default '' check (char_length(agreement_note) <= 1000),
  note text not null default '' check (char_length(note) <= 500),
  confirmed_at timestamptz,
  confirmed_by uuid references public.staff_profiles(id) on delete restrict,
  settled_at timestamptz,
  settled_by uuid references public.staff_profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references public.staff_profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_settlement_rate_scope check (
    (calculation_method = 'gross_profit_rate' and rate_percent is not null)
    or (calculation_method <> 'gross_profit_rate' and rate_percent is null)
  ),
  constraint staff_settlement_charge_agreement check (
    direction <> 'charge_staff' or (agreement_confirmed and char_length(trim(agreement_note)) > 0)
  ),
  constraint staff_settlement_status_consistency check (
    (status = 'planned' and confirmed_amount is null and confirmed_at is null and confirmed_by is null and settled_at is null and settled_by is null and cancelled_at is null and cancelled_by is null)
    or (status = 'confirmed' and confirmed_amount is not null and confirmed_at is not null and confirmed_by is not null and settled_at is null and settled_by is null and cancelled_at is null and cancelled_by is null)
    or (status = 'settled' and confirmed_amount is not null and confirmed_at is not null and confirmed_by is not null and settled_at is not null and settled_by is not null and cancelled_at is null and cancelled_by is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
  )
);

alter table public.cashflows
  add constraint cashflows_staff_settlement_fk
  foreign key (source_staff_settlement_id) references public.staff_settlements(id) on delete restrict;
create unique index cashflows_staff_settlement_key on public.cashflows(source_staff_settlement_id)
  where source_staff_settlement_id is not null and deleted_at is null;
create index staff_settlements_staff_idx on public.staff_settlements(staff_id, created_at desc);
create index staff_settlements_vehicle_idx on public.staff_settlements(vehicle_id, created_at desc);

create trigger staff_settlements_set_updated_at before update on public.staff_settlements
for each row execute function private.set_updated_columns();
create trigger staff_settlements_audit after insert or update or delete on public.staff_settlements
for each row execute function private.write_audit_log();

alter table public.staff_settlements enable row level security;
grant select on public.staff_settlements to authenticated;

create policy staff_settlements_management_read
on public.staff_settlements for select to authenticated
using (private.has_role(array['owner', 'accounting']::public.staff_role[]));
create policy staff_settlements_self_read
on public.staff_settlements for select to authenticated
using (
  private.has_role(array['regular', 'spot']::public.staff_role[])
  and staff_id = (select auth.uid())
);

create policy staff_profiles_accounting_read
on public.staff_profiles for select to authenticated
using (private.has_role(array['accounting']::public.staff_role[]));

create or replace function public.save_staff_settlement(
  p_settlement_id uuid,
  p_staff_id uuid,
  p_vehicle_id uuid,
  p_contract_id uuid,
  p_direction public.staff_settlement_direction,
  p_engagement_type public.staff_engagement_type,
  p_business_type public.staff_business_type,
  p_calculation_method public.staff_calculation_method,
  p_gross_profit_basis bigint,
  p_rate_percent numeric,
  p_manual_amount bigint,
  p_payment_method public.payment_method,
  p_agreement_confirmed boolean,
  p_agreement_note text,
  p_note text
)
returns public.staff_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_profiles;
  v_settlement public.staff_settlements;
  v_planned_amount bigint;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception 'スタッフ精算の条件を登録できるのは事業主だけです。';
  end if;
  select * into v_staff from public.staff_profiles where id = p_staff_id and is_active and role in ('regular', 'spot');
  if not found then raise exception '有効な通常スタッフまたはスポットスタッフを選択してください。'; end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and deleted_at is null) then
    raise exception '対象車両が見つかりません。';
  end if;
  if p_contract_id is not null and not exists (
    select 1 from public.contracts where id = p_contract_id and vehicle_id = p_vehicle_id and deleted_at is null
  ) then raise exception '対象車両に紐づく契約を選択してください。'; end if;
  if coalesce(p_gross_profit_basis, 0) < 0 then raise exception '粗利基準額は0円以上で入力してください。'; end if;
  if char_length(coalesce(p_agreement_note, '')) > 1000 or char_length(coalesce(p_note, '')) > 500 then
    raise exception '合意内容または備考が長すぎます。';
  end if;
  if p_direction = 'charge_staff' and (not coalesce(p_agreement_confirmed, false) or char_length(trim(coalesce(p_agreement_note, ''))) = 0) then
    raise exception 'スタッフへの請求は双方合意の確認と合意内容が必要です。';
  end if;

  if p_calculation_method = 'gross_profit_rate' then
    if p_rate_percent is null or p_rate_percent <= 0 or p_rate_percent > 100 then raise exception '粗利率は0%%より大きく100%%以下で入力してください。'; end if;
    v_planned_amount := floor(coalesce(p_gross_profit_basis, 0) * p_rate_percent / 100.0)::bigint;
  else
    v_planned_amount := coalesce(p_manual_amount, 0);
  end if;
  if v_planned_amount <= 0 then raise exception '予定額は1円以上になるよう入力してください。'; end if;

  if p_settlement_id is null then
    insert into public.staff_settlements(
      staff_id, vehicle_id, contract_id, direction, engagement_type, business_type,
      calculation_method, gross_profit_basis, rate_percent, planned_amount, payment_method,
      agreement_confirmed, agreement_note, note
    ) values (
      p_staff_id, p_vehicle_id, p_contract_id, p_direction, p_engagement_type, p_business_type,
      p_calculation_method, coalesce(p_gross_profit_basis, 0), case when p_calculation_method = 'gross_profit_rate' then p_rate_percent else null end,
      v_planned_amount, p_payment_method, coalesce(p_agreement_confirmed, false), trim(coalesce(p_agreement_note, '')), trim(coalesce(p_note, ''))
    ) returning * into v_settlement;
  else
    update public.staff_settlements set
      staff_id = p_staff_id, vehicle_id = p_vehicle_id, contract_id = p_contract_id,
      direction = p_direction, engagement_type = p_engagement_type, business_type = p_business_type,
      calculation_method = p_calculation_method, gross_profit_basis = coalesce(p_gross_profit_basis, 0),
      rate_percent = case when p_calculation_method = 'gross_profit_rate' then p_rate_percent else null end,
      planned_amount = v_planned_amount, payment_method = p_payment_method,
      agreement_confirmed = coalesce(p_agreement_confirmed, false), agreement_note = trim(coalesce(p_agreement_note, '')),
      note = trim(coalesce(p_note, ''))
    where id = p_settlement_id and status = 'planned'
    returning * into v_settlement;
    if not found then raise exception '予定状態の精算だけ修正できます。'; end if;
  end if;
  return v_settlement;
end;
$$;

create or replace function public.confirm_staff_settlement(
  p_settlement_id uuid,
  p_confirmed_amount bigint,
  p_confirmed_on date
)
returns public.staff_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.staff_settlements;
  v_staff_name text;
begin
  if not private.has_role(array['owner', 'accounting']::public.staff_role[]) then raise exception '精算を確定する権限がありません。'; end if;
  if coalesce(p_confirmed_amount, 0) <= 0 then raise exception '確定額は1円以上で入力してください。'; end if;
  if p_confirmed_on is null or p_confirmed_on > current_date then raise exception '確定日は今日以前で入力してください。'; end if;
  select * into v_settlement from public.staff_settlements where id = p_settlement_id and status = 'planned' for update;
  if not found then raise exception '予定状態の精算が見つかりません。'; end if;
  select display_name into v_staff_name from public.staff_profiles where id = v_settlement.staff_id;

  insert into public.cashflows(
    vehicle_id, source_staff_settlement_id, direction, kind, description, amount,
    processed_amount, status, method, scheduled_on, processed_on
  ) values (
    v_settlement.vehicle_id, v_settlement.id,
    case v_settlement.direction when 'pay_staff' then 'outgoing'::public.cashflow_direction else 'incoming'::public.cashflow_direction end,
    'other',
    case v_settlement.direction when 'pay_staff' then 'スタッフ紹介料・成果報酬 ' else 'スタッフへの合意済み請求 ' end || v_staff_name,
    p_confirmed_amount, 0, 'unprocessed', v_settlement.payment_method, p_confirmed_on, null
  );

  update public.staff_settlements set
    confirmed_amount = p_confirmed_amount, status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
  where id = p_settlement_id returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.settle_staff_settlement(p_settlement_id uuid, p_settled_on date)
returns public.staff_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare v_settlement public.staff_settlements;
begin
  if not private.has_role(array['owner', 'accounting']::public.staff_role[]) then raise exception '精算を完了する権限がありません。'; end if;
  if p_settled_on is null or p_settled_on > current_date then raise exception '精算日は今日以前で入力してください。'; end if;
  select * into v_settlement from public.staff_settlements where id = p_settlement_id and status = 'confirmed' for update;
  if not found then raise exception '確定済みの精算が見つかりません。'; end if;
  update public.cashflows set processed_amount = amount, status = 'completed', processed_on = p_settled_on
  where source_staff_settlement_id = p_settlement_id and deleted_at is null;
  update public.staff_settlements set status = 'settled', settled_at = now(), settled_by = auth.uid()
  where id = p_settlement_id returning * into v_settlement;
  return v_settlement;
end;
$$;

create or replace function public.cancel_staff_settlement(p_settlement_id uuid)
returns public.staff_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare v_settlement public.staff_settlements;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then raise exception '精算を取り消せるのは事業主だけです。'; end if;
  select * into v_settlement from public.staff_settlements where id = p_settlement_id and status in ('planned', 'confirmed') for update;
  if not found then raise exception '予定または確定状態の精算が見つかりません。'; end if;
  if v_settlement.status = 'confirmed' then
    update public.cashflows set deleted_at = now(), deleted_by = auth.uid()
    where source_staff_settlement_id = p_settlement_id and status = 'unprocessed' and deleted_at is null;
    if not found then raise exception '処理済みの入出金があるため取り消せません。'; end if;
  end if;
  update public.staff_settlements set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_settlement_id returning * into v_settlement;
  return v_settlement;
end;
$$;

revoke all on function public.save_staff_settlement(uuid, uuid, uuid, uuid, public.staff_settlement_direction, public.staff_engagement_type, public.staff_business_type, public.staff_calculation_method, bigint, numeric, bigint, public.payment_method, boolean, text, text) from public, anon;
grant execute on function public.save_staff_settlement(uuid, uuid, uuid, uuid, public.staff_settlement_direction, public.staff_engagement_type, public.staff_business_type, public.staff_calculation_method, bigint, numeric, bigint, public.payment_method, boolean, text, text) to authenticated;
revoke all on function public.confirm_staff_settlement(uuid, bigint, date) from public, anon;
grant execute on function public.confirm_staff_settlement(uuid, bigint, date) to authenticated;
revoke all on function public.settle_staff_settlement(uuid, date) from public, anon;
grant execute on function public.settle_staff_settlement(uuid, date) to authenticated;
revoke all on function public.cancel_staff_settlement(uuid) from public, anon;
grant execute on function public.cancel_staff_settlement(uuid) to authenticated;
