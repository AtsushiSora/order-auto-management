-- 買取契約を下書きから保持し、契約成立時に在庫と支払い予定を一括作成する。

alter table public.contracts
  alter column vehicle_id drop not null;

alter table public.contracts
  add column vehicle_name text,
  add column chassis_number text,
  add column acquisition_source public.acquisition_source,
  add column asking_price bigint not null default 0 check (asking_price >= 0),
  add column storage_location text not null default '自宅',
  add column planned_arrival_date date,
  add column purchase_payment_method public.payment_method;

update public.contracts c
set
  vehicle_name = v.name,
  chassis_number = v.chassis_number,
  acquisition_source = v.acquisition_source,
  asking_price = v.asking_price,
  storage_location = v.storage_location,
  planned_arrival_date = v.planned_arrival_date,
  purchase_payment_method = case when c.type = 'purchase' then 'bank_transfer'::public.payment_method else null end
from public.vehicles v
where v.id = c.vehicle_id;

alter table public.contracts
  add constraint purchase_contract_vehicle_details check (
    type <> 'purchase'
    or (
      vehicle_name is not null
      and char_length(trim(vehicle_name)) between 1 and 160
      and acquisition_source is not null
      and planned_arrival_date is not null
      and purchase_payment_method is not null
    )
  ),
  add constraint contracted_contract_has_vehicle check (
    status <> 'contracted' or vehicle_id is not null
  );

create or replace function public.save_purchase_contract(
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
security invoker
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_vehicle_id uuid;
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '買取契約を変更する権限がありません。';
  end if;
  if char_length(trim(p_customer_label)) < 1 then
    raise exception 'お客様名を入力してください。';
  end if;
  if char_length(trim(p_vehicle_name)) < 1 then
    raise exception '車両名を入力してください。';
  end if;
  if p_amount < 0 or p_asking_price < 0 then
    raise exception '金額は0円以上で入力してください。';
  end if;

  if p_contract_id is null then
    insert into public.contracts (
      type,
      vehicle_id,
      customer_label,
      amount,
      status,
      contracted_on,
      vehicle_name,
      chassis_number,
      acquisition_source,
      asking_price,
      storage_location,
      planned_arrival_date,
      purchase_payment_method
    ) values (
      'purchase',
      null,
      trim(p_customer_label),
      p_amount,
      case when p_status = 'contracted' then 'draft'::public.contract_status else p_status end,
      p_contracted_on,
      trim(p_vehicle_name),
      nullif(trim(coalesce(p_chassis_number, '')), ''),
      p_acquisition_source,
      p_asking_price,
      trim(p_storage_location),
      p_planned_arrival_date,
      p_payment_method
    ) returning * into v_contract;
  else
    select * into v_contract
    from public.contracts
    where id = p_contract_id
      and type = 'purchase'
      and deleted_at is null
    for update;

    if v_contract.id is null then
      raise exception '対象の買取契約が見つかりません。';
    end if;
    if v_contract.status = 'contracted' then
      raise exception '契約済みの内容は在庫画面から修正してください。';
    end if;

    update public.contracts
    set
      customer_label = trim(p_customer_label),
      amount = p_amount,
      status = case when p_status = 'contracted' then status else p_status end,
      contracted_on = p_contracted_on,
      vehicle_name = trim(p_vehicle_name),
      chassis_number = nullif(trim(coalesce(p_chassis_number, '')), ''),
      acquisition_source = p_acquisition_source,
      asking_price = p_asking_price,
      storage_location = trim(p_storage_location),
      planned_arrival_date = p_planned_arrival_date,
      purchase_payment_method = p_payment_method
    where id = p_contract_id
    returning * into v_contract;
  end if;

  if p_status = 'contracted' then
    insert into public.vehicles (
      name,
      chassis_number,
      status,
      acquisition_source,
      purchase_price,
      asking_price,
      storage_location,
      planned_arrival_date
    ) values (
      trim(p_vehicle_name),
      nullif(trim(coalesce(p_chassis_number, '')), ''),
      'planned_arrival',
      p_acquisition_source,
      p_amount,
      p_asking_price,
      trim(p_storage_location),
      p_planned_arrival_date
    ) returning id into v_vehicle_id;

    update public.contracts
    set vehicle_id = v_vehicle_id, status = 'contracted'
    where id = v_contract.id;

    if p_amount > 0 then
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
        v_vehicle_id,
        'outgoing',
        'purchase_payment',
        '買取代金 ' || trim(p_customer_label),
        p_amount,
        0,
        'unprocessed',
        p_payment_method,
        p_planned_arrival_date
      );
    end if;
  end if;

  return v_contract.id;
end;
$$;

revoke all on function public.save_purchase_contract(
  uuid, text, bigint, public.contract_status, date, text, text,
  public.acquisition_source, bigint, text, date, public.payment_method
) from public, anon;

grant execute on function public.save_purchase_contract(
  uuid, text, bigint, public.contract_status, date, text, text,
  public.acquisition_source, bigint, text, date, public.payment_method
) to authenticated;
