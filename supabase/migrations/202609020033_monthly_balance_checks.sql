-- 実際に動いた現金・預金を月別に照合するための入出金イベントと月次残高確認。

create table public.cashflow_events (
  id uuid primary key default gen_random_uuid(),
  cashflow_id uuid not null references public.cashflows(id) on delete restrict,
  amount bigint not null check (amount > 0),
  method public.payment_method not null,
  processed_on date not null check (processed_on <= current_date),
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index cashflow_events_month_idx on public.cashflow_events(processed_on desc, cashflow_id);

insert into public.cashflow_events(cashflow_id, amount, method, processed_on, created_by, created_at)
select
  cashflow.id,
  cashflow.processed_amount - coalesce(offsets.amount, 0),
  cashflow.method,
  cashflow.processed_on,
  cashflow.created_by,
  cashflow.updated_at
from public.cashflows cashflow
left join (
  select flow_id, sum(amount)::bigint as amount
  from (
    select sale_cashflow_id as flow_id, amount from public.cashflow_offsets where voided_at is null
    union all
    select purchase_cashflow_id as flow_id, amount from public.cashflow_offsets where voided_at is null
  ) active_offsets
  group by flow_id
) offsets on offsets.flow_id = cashflow.id
where cashflow.processed_on is not null
  and cashflow.processed_amount > coalesce(offsets.amount, 0);

create or replace function private.capture_cashflow_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_amount bigint := case when tg_op = 'INSERT' then 0 else old.processed_amount end;
  v_delta bigint := new.processed_amount - v_previous_amount;
begin
  if v_delta > 0
     and new.processed_on is not null
     and coalesce(current_setting('order_auto.offset_update', true), '') <> 'on' then
    insert into public.cashflow_events(cashflow_id, amount, method, processed_on, created_by)
    values (new.id, v_delta, new.method, new.processed_on, coalesce(auth.uid(), new.updated_by, new.created_by));
  end if;
  return new;
end;
$$;

create trigger cashflow_events_after_insert
after insert on public.cashflows
for each row execute function private.capture_cashflow_event();

create trigger cashflow_events_after_processed_update
after update of processed_amount on public.cashflows
for each row execute function private.capture_cashflow_event();

alter table public.cashflow_events enable row level security;
grant select on public.cashflow_events to authenticated;

create policy cashflow_events_business_read
on public.cashflow_events for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create table public.monthly_balance_checks (
  id uuid primary key default gen_random_uuid(),
  target_month date not null unique check (target_month = date_trunc('month', target_month)::date),
  opening_cash_balance bigint not null check (opening_cash_balance >= 0),
  opening_bank_balance bigint not null check (opening_bank_balance >= 0),
  cash_movement bigint not null,
  bank_movement bigint not null,
  system_cash_balance bigint not null check (system_cash_balance >= 0),
  system_bank_balance bigint not null check (system_bank_balance >= 0),
  actual_cash_balance bigint not null check (actual_cash_balance >= 0),
  actual_bank_balance bigint not null check (actual_bank_balance >= 0),
  cash_difference bigint not null,
  bank_difference bigint not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  note text not null default '',
  confirmed_at timestamptz,
  confirmed_by uuid references public.staff_profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_balance_confirmation_consistency check (
    (status = 'draft' and confirmed_at is null and confirmed_by is null)
    or (status = 'confirmed' and confirmed_at is not null and confirmed_by is not null and cash_difference = 0 and bank_difference = 0)
  )
);

create trigger monthly_balance_checks_updated_at before update on public.monthly_balance_checks
for each row execute function private.set_updated_columns();
create trigger monthly_balance_checks_audit after insert or update or delete on public.monthly_balance_checks
for each row execute function private.write_audit_log();

alter table public.monthly_balance_checks enable row level security;
grant select on public.monthly_balance_checks to authenticated;

create policy monthly_balance_checks_business_read
on public.monthly_balance_checks for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create or replace function public.save_monthly_balance_check(
  p_target_month date,
  p_opening_cash_balance bigint,
  p_opening_bank_balance bigint,
  p_actual_cash_balance bigint,
  p_actual_bank_balance bigint,
  p_note text default '',
  p_confirm boolean default false
)
returns public.monthly_balance_checks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.monthly_balance_checks;
  v_cash_movement bigint := 0;
  v_bank_movement bigint := 0;
  v_system_cash bigint;
  v_system_bank bigint;
  v_cash_difference bigint;
  v_bank_difference bigint;
  v_saved public.monthly_balance_checks;
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '月次残高を保存する権限がありません。';
  end if;
  if p_confirm and not private.has_role(array['owner', 'accounting']::public.staff_role[]) then
    raise exception '月次確定は事業主または経理担当だけができます。';
  end if;
  if p_target_month is null or p_target_month <> date_trunc('month', p_target_month)::date then
    raise exception '対象月を確認してください。';
  end if;
  if p_target_month > date_trunc('month', current_date)::date then
    raise exception '未来の月は保存できません。';
  end if;
  if least(p_opening_cash_balance, p_opening_bank_balance, p_actual_cash_balance, p_actual_bank_balance) < 0 then
    raise exception '残高は0円以上で入力してください。';
  end if;

  select * into v_existing
  from public.monthly_balance_checks
  where target_month = p_target_month
  for update;
  if found and v_existing.status = 'confirmed' then
    raise exception '確定済みの月は変更できません。';
  end if;

  select
    coalesce(sum(case when event.method = 'cash' then case when cashflow.direction = 'incoming' then event.amount else -event.amount end else 0 end), 0)::bigint,
    coalesce(sum(case when event.method = 'bank_transfer' then case when cashflow.direction = 'incoming' then event.amount else -event.amount end else 0 end), 0)::bigint
  into v_cash_movement, v_bank_movement
  from public.cashflow_events event
  join public.cashflows cashflow on cashflow.id = event.cashflow_id
  where event.processed_on >= p_target_month
    and event.processed_on < (p_target_month + interval '1 month')::date;

  v_system_cash := p_opening_cash_balance + v_cash_movement;
  v_system_bank := p_opening_bank_balance + v_bank_movement;
  if v_system_cash < 0 or v_system_bank < 0 then
    raise exception '期首残高より支払いが多く、システム残高がマイナスになります。';
  end if;
  v_cash_difference := p_actual_cash_balance - v_system_cash;
  v_bank_difference := p_actual_bank_balance - v_system_bank;
  if p_confirm and (v_cash_difference <> 0 or v_bank_difference <> 0) then
    raise exception '現金と事業用口座の差額が0円になるまで月次確定できません。';
  end if;

  insert into public.monthly_balance_checks(
    target_month, opening_cash_balance, opening_bank_balance, cash_movement, bank_movement,
    system_cash_balance, system_bank_balance, actual_cash_balance, actual_bank_balance,
    cash_difference, bank_difference, status, note, confirmed_at, confirmed_by, created_by, updated_by
  ) values (
    p_target_month, p_opening_cash_balance, p_opening_bank_balance, v_cash_movement, v_bank_movement,
    v_system_cash, v_system_bank, p_actual_cash_balance, p_actual_bank_balance,
    v_cash_difference, v_bank_difference, case when p_confirm then 'confirmed' else 'draft' end,
    trim(coalesce(p_note, '')), case when p_confirm then now() else null end,
    case when p_confirm then auth.uid() else null end, auth.uid(), auth.uid()
  )
  on conflict (target_month) do update set
    opening_cash_balance = excluded.opening_cash_balance,
    opening_bank_balance = excluded.opening_bank_balance,
    cash_movement = excluded.cash_movement,
    bank_movement = excluded.bank_movement,
    system_cash_balance = excluded.system_cash_balance,
    system_bank_balance = excluded.system_bank_balance,
    actual_cash_balance = excluded.actual_cash_balance,
    actual_bank_balance = excluded.actual_bank_balance,
    cash_difference = excluded.cash_difference,
    bank_difference = excluded.bank_difference,
    status = excluded.status,
    note = excluded.note,
    confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by,
    updated_by = auth.uid()
  returning * into v_saved;
  return v_saved;
end;
$$;

create or replace function public.apply_cashflow_offset(
  p_sale_cashflow_id uuid,
  p_purchase_cashflow_id uuid,
  p_amount bigint,
  p_offset_on date,
  p_note text default ''
)
returns public.cashflow_offsets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.cashflows;
  v_purchase public.cashflows;
  v_purchase_vehicle public.vehicles;
  v_sale_customer text;
  v_purchase_customer text;
  v_offset public.cashflow_offsets;
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then raise exception '相殺を登録する権限がありません。'; end if;
  if p_offset_on is null or p_offset_on > current_date then raise exception '相殺日は今日以前で入力してください。'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception '相殺額は1円以上で入力してください。'; end if;

  select * into v_sale from public.cashflows where id = p_sale_cashflow_id and deleted_at is null for update;
  if not found or v_sale.direction <> 'incoming' or v_sale.kind <> 'sale_receipt' then raise exception '販売代金の入金を選択してください。'; end if;
  select * into v_purchase from public.cashflows where id = p_purchase_cashflow_id and deleted_at is null for update;
  if not found or v_purchase.direction <> 'outgoing' or v_purchase.kind <> 'purchase_payment' then raise exception '買取代金の支払いを選択してください。'; end if;
  select * into v_purchase_vehicle from public.vehicles where id = v_purchase.vehicle_id and deleted_at is null;
  if not found or v_purchase_vehicle.arrived_at is null or v_purchase_vehicle.status = 'planned_arrival' then raise exception '買取車両の入庫を確定してから相殺してください。'; end if;
  if p_amount > v_sale.amount - v_sale.processed_amount or p_amount > v_purchase.amount - v_purchase.processed_amount then raise exception '相殺額が販売代金または買取代金の残額を超えています。'; end if;

  select customer_label into v_sale_customer from public.contracts where type = 'sale' and status = 'contracted' and vehicle_id = v_sale.vehicle_id and deleted_at is null order by updated_at desc limit 1;
  select customer_label into v_purchase_customer from public.contracts where type = 'purchase' and status = 'contracted' and vehicle_id = v_purchase.vehicle_id and deleted_at is null order by updated_at desc limit 1;
  if v_sale_customer is null or v_purchase_customer is null or trim(v_sale_customer) <> trim(v_purchase_customer) then raise exception '同じお客様の契約同士だけ相殺できます。'; end if;

  insert into public.cashflow_offsets(sale_cashflow_id, purchase_cashflow_id, amount, offset_on, note)
  values (p_sale_cashflow_id, p_purchase_cashflow_id, p_amount, p_offset_on, trim(coalesce(p_note, '')))
  returning * into v_offset;

  perform set_config('order_auto.offset_update', 'on', true);
  update public.cashflows
  set processed_amount = processed_amount + p_amount,
      status = case when processed_amount + p_amount = amount then 'completed'::public.cashflow_status else 'partial'::public.cashflow_status end,
      processed_on = p_offset_on,
      updated_by = auth.uid()
  where id in (p_sale_cashflow_id, p_purchase_cashflow_id);
  return v_offset;
end;
$$;

revoke all on function public.save_monthly_balance_check(date, bigint, bigint, bigint, bigint, text, boolean) from public, anon;
grant execute on function public.save_monthly_balance_check(date, bigint, bigint, bigint, bigint, text, boolean) to authenticated;
revoke all on function public.apply_cashflow_offset(uuid, uuid, bigint, date, text) from public, anon;
grant execute on function public.apply_cashflow_offset(uuid, uuid, bigint, date, text) to authenticated;
