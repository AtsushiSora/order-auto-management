-- 販売代金と買取代金の相殺。買取車両の入庫後だけ登録できる。

create table public.cashflow_offsets (
  id uuid primary key default gen_random_uuid(),
  sale_cashflow_id uuid not null references public.cashflows(id) on delete restrict,
  purchase_cashflow_id uuid not null references public.cashflows(id) on delete restrict,
  amount bigint not null check (amount > 0),
  offset_on date not null,
  note text not null default '',
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint cashflow_offset_distinct_flows check (sale_cashflow_id <> purchase_cashflow_id),
  constraint cashflow_offset_void_consistency check (
    (voided_at is null and voided_by is null) or (voided_at is not null and voided_by is not null)
  )
);

create index cashflow_offsets_sale_idx on public.cashflow_offsets(sale_cashflow_id, created_at desc);
create index cashflow_offsets_purchase_idx on public.cashflow_offsets(purchase_cashflow_id, created_at desc);

create trigger cashflow_offsets_audit after insert or update or delete on public.cashflow_offsets
for each row execute function private.write_audit_log();

alter table public.cashflow_offsets enable row level security;
grant select on public.cashflow_offsets to authenticated;

create policy cashflow_offsets_business_read
on public.cashflow_offsets for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

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
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '相殺を登録する権限がありません。';
  end if;
  if p_offset_on is null or p_offset_on > current_date then
    raise exception '相殺日は今日以前で入力してください。';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception '相殺額は1円以上で入力してください。';
  end if;

  select * into v_sale
  from public.cashflows
  where id = p_sale_cashflow_id and deleted_at is null
  for update;
  if not found or v_sale.direction <> 'incoming' or v_sale.kind <> 'sale_receipt' then
    raise exception '販売代金の入金を選択してください。';
  end if;

  select * into v_purchase
  from public.cashflows
  where id = p_purchase_cashflow_id and deleted_at is null
  for update;
  if not found or v_purchase.direction <> 'outgoing' or v_purchase.kind <> 'purchase_payment' then
    raise exception '買取代金の支払いを選択してください。';
  end if;

  select * into v_purchase_vehicle from public.vehicles where id = v_purchase.vehicle_id and deleted_at is null;
  if not found or v_purchase_vehicle.arrived_at is null or v_purchase_vehicle.status = 'planned_arrival' then
    raise exception '買取車両の入庫を確定してから相殺してください。';
  end if;

  if p_amount > v_sale.amount - v_sale.processed_amount
     or p_amount > v_purchase.amount - v_purchase.processed_amount then
    raise exception '相殺額が販売代金または買取代金の残額を超えています。';
  end if;

  select customer_label into v_sale_customer
  from public.contracts
  where type = 'sale' and status = 'contracted' and vehicle_id = v_sale.vehicle_id and deleted_at is null
  order by updated_at desc limit 1;
  select customer_label into v_purchase_customer
  from public.contracts
  where type = 'purchase' and status = 'contracted' and vehicle_id = v_purchase.vehicle_id and deleted_at is null
  order by updated_at desc limit 1;
  if v_sale_customer is null or v_purchase_customer is null or trim(v_sale_customer) <> trim(v_purchase_customer) then
    raise exception '同じお客様の契約同士だけ相殺できます。';
  end if;

  insert into public.cashflow_offsets(sale_cashflow_id, purchase_cashflow_id, amount, offset_on, note)
  values (p_sale_cashflow_id, p_purchase_cashflow_id, p_amount, p_offset_on, trim(coalesce(p_note, '')))
  returning * into v_offset;

  update public.cashflows
  set processed_amount = processed_amount + p_amount,
      status = case when processed_amount + p_amount = amount then 'completed'::public.cashflow_status else 'partial'::public.cashflow_status end,
      processed_on = p_offset_on,
      updated_by = auth.uid()
  where id in (p_sale_cashflow_id, p_purchase_cashflow_id);

  return v_offset;
end;
$$;

create or replace function public.void_cashflow_offset(p_offset_id uuid)
returns public.cashflow_offsets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset public.cashflow_offsets;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '相殺の取消は事業主だけができます。';
  end if;
  select * into v_offset from public.cashflow_offsets where id = p_offset_id and voided_at is null for update;
  if not found then raise exception '有効な相殺記録が見つかりません。'; end if;

  if exists (
    select 1 from public.cashflows
    where id in (v_offset.sale_cashflow_id, v_offset.purchase_cashflow_id)
      and processed_amount < v_offset.amount
  ) then
    raise exception '入出金の処理済み額と一致しないため相殺を取り消せません。';
  end if;

  update public.cashflows
  set processed_amount = processed_amount - v_offset.amount,
      status = case
        when processed_amount - v_offset.amount = 0 then 'unprocessed'::public.cashflow_status
        when processed_amount - v_offset.amount = amount then 'completed'::public.cashflow_status
        else 'partial'::public.cashflow_status
      end,
      processed_on = case when processed_amount - v_offset.amount = 0 then null else processed_on end,
      updated_by = auth.uid()
  where id in (v_offset.sale_cashflow_id, v_offset.purchase_cashflow_id);

  update public.cashflow_offsets
  set voided_at = now(), voided_by = auth.uid()
  where id = p_offset_id
  returning * into v_offset;
  return v_offset;
end;
$$;

revoke all on function public.apply_cashflow_offset(uuid, uuid, bigint, date, text) from public, anon;
grant execute on function public.apply_cashflow_offset(uuid, uuid, bigint, date, text) to authenticated;
revoke all on function public.void_cashflow_offset(uuid) from public, anon;
grant execute on function public.void_cashflow_offset(uuid) to authenticated;
