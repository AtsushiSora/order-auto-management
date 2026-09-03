-- 契約を任せる買取・廃車案件の金額は、事業主が割り当て時に決定する。
alter table public.spot_assignments
add column contract_amount bigint
check (contract_amount is null or contract_amount >= 0);

update public.spot_assignments as assignment
set contract_amount = contract.amount
from public.contracts as contract
where assignment.contract_id = contract.id
  and assignment.business_type in ('purchase_auction', 'scrap')
  and assignment.engagement_type = 'full_service';

create or replace function public.save_spot_assignment(
  p_assignment_id uuid,
  p_staff_id uuid,
  p_engagement_type public.staff_engagement_type,
  p_business_type public.staff_business_type,
  p_vehicle_id uuid,
  p_contract_amount bigint,
  p_lead_label text,
  p_referral_note text
)
returns public.spot_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.spot_assignments;
  v_contract_amount bigint;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '担当案件を登録できるのは事業主だけです。';
  end if;
  if p_contract_amount is not null and p_contract_amount < 0 then
    raise exception '買取金額は0円以上で入力してください。';
  end if;
  if p_engagement_type = 'full_service'
    and p_business_type in ('purchase_auction', 'scrap')
    and p_contract_amount is null then
    raise exception '買取・廃車の契約を任せる場合は、事業主が買取金額を入力してください。';
  end if;

  v_contract_amount := case
    when p_engagement_type = 'full_service' and p_business_type in ('purchase_auction', 'scrap')
      then p_contract_amount
    else null
  end;

  v_assignment := public.save_spot_assignment(
    p_assignment_id,
    p_staff_id,
    p_engagement_type,
    p_business_type,
    p_vehicle_id,
    p_lead_label,
    p_referral_note
  );

  update public.spot_assignments as assignment
  set contract_amount = v_contract_amount,
      updated_by = auth.uid()
  where assignment.id = v_assignment.id
  returning * into v_assignment;

  return v_assignment;
end;
$$;

revoke execute on function public.save_spot_assignment(
  uuid, uuid, public.staff_engagement_type, public.staff_business_type, uuid, text, text
) from authenticated;
revoke all on function public.save_spot_assignment(
  uuid, uuid, public.staff_engagement_type, public.staff_business_type, uuid, bigint, text, text
) from public, anon;
grant execute on function public.save_spot_assignment(
  uuid, uuid, public.staff_engagement_type, public.staff_business_type, uuid, bigint, text, text
) to authenticated;

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
  if v_assignment.contract_amount is null then
    raise exception '事業主が買取金額を設定してから契約してください。';
  end if;
  if p_amount is distinct from v_assignment.contract_amount then
    raise exception '買取金額は事業主が設定した金額から変更できません。';
  end if;
  if p_contract_id is distinct from v_assignment.contract_id and not (p_contract_id is null and v_assignment.contract_id is null) then
    raise exception '担当案件に紐づく契約だけ変更できます。';
  end if;
  if char_length(trim(coalesce(p_customer_label, ''))) < 1 or char_length(trim(coalesce(p_vehicle_name, ''))) < 1 then
    raise exception 'お客様名と車両名を入力してください。';
  end if;
  if p_asking_price < 0 then raise exception '金額は0円以上で入力してください。'; end if;

  if v_assignment.contract_id is null then
    insert into public.contracts(type, vehicle_id, customer_label, amount, status, contracted_on, vehicle_name, chassis_number,
      acquisition_source, asking_price, storage_location, planned_arrival_date, purchase_payment_method)
    values ('purchase', null, trim(p_customer_label), v_assignment.contract_amount,
      case when p_status = 'contracted' then 'draft'::public.contract_status else p_status end,
      p_contracted_on, trim(p_vehicle_name), nullif(trim(coalesce(p_chassis_number, '')), ''), p_acquisition_source,
      p_asking_price, trim(p_storage_location), p_planned_arrival_date, p_payment_method)
    returning * into v_contract;
    update public.spot_assignments set contract_id = v_contract.id where id = v_assignment.id;
  else
    select * into v_contract from public.contracts where id = v_assignment.contract_id and type = 'purchase' and deleted_at is null for update;
    if not found then raise exception '担当案件の買取契約が見つかりません。'; end if;
    if v_contract.status = 'contracted' then raise exception '契約済みの内容は修正できません。'; end if;
    update public.contracts set customer_label = trim(p_customer_label), amount = v_assignment.contract_amount,
      status = case when p_status = 'contracted' then status else p_status end, contracted_on = p_contracted_on,
      vehicle_name = trim(p_vehicle_name), chassis_number = nullif(trim(coalesce(p_chassis_number, '')), ''),
      acquisition_source = p_acquisition_source, asking_price = p_asking_price, storage_location = trim(p_storage_location),
      planned_arrival_date = p_planned_arrival_date, purchase_payment_method = p_payment_method
    where id = v_contract.id returning * into v_contract;
  end if;

  if p_status = 'contracted' then
    insert into public.vehicles(name, chassis_number, status, acquisition_source, purchase_price, asking_price, storage_location, planned_arrival_date)
    values (trim(p_vehicle_name), nullif(trim(coalesce(p_chassis_number, '')), ''), 'planned_arrival', p_acquisition_source,
      v_assignment.contract_amount, p_asking_price, trim(p_storage_location), p_planned_arrival_date)
    returning id into v_vehicle_id;
    update public.contracts set vehicle_id = v_vehicle_id, status = 'contracted' where id = v_contract.id;
    update public.spot_assignments set vehicle_id = v_vehicle_id where id = v_assignment.id;
    if v_assignment.contract_amount > 0 then
      insert into public.cashflows(vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on)
      values (v_vehicle_id, 'outgoing', 'purchase_payment', '買取代金 ' || trim(p_customer_label), v_assignment.contract_amount, 0, 'unprocessed', p_payment_method, p_planned_arrival_date);
    end if;
  end if;
  return v_contract.id;
end;
$$;

