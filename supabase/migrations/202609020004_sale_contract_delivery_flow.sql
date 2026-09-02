-- 販売契約から売約・未入金を作成し、入金完了後だけ納車できるようにする。

alter table public.contracts
  add column sale_payment_method public.payment_method;

update public.contracts
set sale_payment_method = 'bank_transfer'
where type = 'sale'
  and sale_payment_method is null;

alter table public.contracts
  add constraint sale_contract_payment_details check (
    type <> 'sale' or sale_payment_method is not null
  );

create unique index contracts_one_active_sale_per_vehicle
  on public.contracts(vehicle_id)
  where type = 'sale'
    and status <> 'cancelled'
    and deleted_at is null;

create or replace function public.save_sale_contract(
  p_contract_id uuid,
  p_vehicle_id uuid,
  p_customer_label text,
  p_amount bigint,
  p_status public.contract_status,
  p_contracted_on date,
  p_payment_method public.payment_method
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_vehicle public.vehicles;
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '販売契約を変更する権限がありません。';
  end if;
  if p_vehicle_id is null then
    raise exception '販売する車両を選択してください。';
  end if;
  if char_length(trim(p_customer_label)) < 1 then
    raise exception 'お客様名を入力してください。';
  end if;
  if p_amount < 0 then
    raise exception '販売金額は0円以上で入力してください。';
  end if;
  if p_status = 'contracted' and p_amount <= 0 then
    raise exception '契約済みにする場合は販売金額を1円以上で入力してください。';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and deleted_at is null
  for update;

  if v_vehicle.id is null then
    raise exception '対象車両が見つかりません。';
  end if;

  if p_contract_id is null then
    insert into public.contracts (
      type,
      vehicle_id,
      customer_label,
      amount,
      status,
      contracted_on,
      sale_payment_method
    ) values (
      'sale',
      p_vehicle_id,
      trim(p_customer_label),
      p_amount,
      case when p_status = 'contracted' then 'draft'::public.contract_status else p_status end,
      p_contracted_on,
      p_payment_method
    ) returning * into v_contract;
  else
    select * into v_contract
    from public.contracts
    where id = p_contract_id
      and type = 'sale'
      and deleted_at is null
    for update;

    if v_contract.id is null then
      raise exception '対象の販売契約が見つかりません。';
    end if;
    if v_contract.status = 'contracted' then
      raise exception '契約済みの内容は在庫画面から確認してください。';
    end if;

    update public.contracts
    set
      vehicle_id = p_vehicle_id,
      customer_label = trim(p_customer_label),
      amount = p_amount,
      status = case when p_status = 'contracted' then status else p_status end,
      contracted_on = p_contracted_on,
      sale_payment_method = p_payment_method
    where id = p_contract_id
    returning * into v_contract;
  end if;

  if p_status = 'contracted' then
    if v_vehicle.status not in ('arrived', 'for_sale') then
      raise exception '入庫済みまたは販売中の車両だけ販売契約できます。';
    end if;

    update public.vehicles
    set
      status = 'reserved',
      sale_price = p_amount
    where id = p_vehicle_id;

    update public.contracts
    set status = 'contracted'
    where id = v_contract.id;

    insert into public.cashflows (
      vehicle_id,
      direction,
      kind,
      description,
      amount,
      processed_amount,
      status,
      method,
      scheduled_on
    ) values (
      p_vehicle_id,
      'incoming',
      'sale_receipt',
      '販売代金 ' || trim(p_customer_label),
      p_amount,
      0,
      'unprocessed',
      p_payment_method,
      p_contracted_on
    );
  end if;

  return v_contract.id;
end;
$$;

create or replace function public.mark_vehicle_delivered(
  p_vehicle_id uuid,
  p_delivered_on date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
  v_receipt_status public.cashflow_status;
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '納車処理を行う権限がありません。';
  end if;
  if p_delivered_on is null then
    raise exception '実際の納車日を入力してください。';
  end if;
  if p_delivered_on > current_date then
    raise exception '実際の納車日に未来の日付は指定できません。';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and deleted_at is null
  for update;

  if v_vehicle.id is null then
    raise exception '対象車両が見つかりません。';
  end if;
  if v_vehicle.status <> 'reserved' then
    raise exception '売約済みの車両だけ納車処理できます。';
  end if;
  if v_vehicle.arrived_at is not null and p_delivered_on < v_vehicle.arrived_at then
    raise exception '納車日は入庫日以降で入力してください。';
  end if;

  select status into v_receipt_status
  from public.cashflows
  where vehicle_id = p_vehicle_id
    and kind = 'sale_receipt'
    and direction = 'incoming'
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_receipt_status is distinct from 'completed'::public.cashflow_status then
    raise exception '販売代金の入金完了後に納車してください。';
  end if;

  update public.vehicles
  set
    status = 'delivered',
    delivered_at = p_delivered_on
  where id = p_vehicle_id;
end;
$$;

revoke all on function public.save_sale_contract(
  uuid, uuid, text, bigint, public.contract_status, date, public.payment_method
) from public, anon;
revoke all on function public.mark_vehicle_delivered(uuid, date) from public, anon;

grant execute on function public.save_sale_contract(
  uuid, uuid, text, bigint, public.contract_status, date, public.payment_method
) to authenticated;
grant execute on function public.mark_vehicle_delivered(uuid, date) to authenticated;
