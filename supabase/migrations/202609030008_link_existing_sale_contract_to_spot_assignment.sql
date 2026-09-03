-- 販売担当を割り当てた車両に有効な販売契約がある場合は、その契約を引き継ぐ。

update public.spot_assignments as assignment
set contract_id = contract.id
from public.contracts as contract
where assignment.contract_id is null
  and assignment.engagement_type = 'full_service'
  and assignment.business_type = 'sale'
  and assignment.status = 'open'
  and contract.type = 'sale'
  and contract.vehicle_id = assignment.vehicle_id
  and contract.status <> 'cancelled'
  and contract.deleted_at is null
  and not exists (
    select 1
    from public.spot_assignments as other_assignment
    where other_assignment.contract_id = contract.id
      and other_assignment.id <> assignment.id
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
declare
  v_assignment public.spot_assignments;
  v_contract_id uuid;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '担当案件を登録できるのは事業主だけです。';
  end if;
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

  if p_engagement_type = 'full_service' and p_business_type = 'sale' then
    select id into v_contract_id
    from public.contracts
    where type = 'sale'
      and vehicle_id = p_vehicle_id
      and status <> 'cancelled'
      and deleted_at is null;

    if v_contract_id is not null and exists (
      select 1 from public.spot_assignments
      where contract_id = v_contract_id
        and id is distinct from p_assignment_id
    ) then
      raise exception 'この車両の販売契約は別の担当案件に紐づいています。';
    end if;
  end if;

  if p_assignment_id is null then
    insert into public.spot_assignments(
      staff_id, engagement_type, business_type, vehicle_id, contract_id, lead_label, referral_note
    )
    values (
      p_staff_id, p_engagement_type, p_business_type, p_vehicle_id, v_contract_id,
      trim(coalesce(p_lead_label, '')), trim(coalesce(p_referral_note, ''))
    )
    returning * into v_assignment;
  else
    update public.spot_assignments set
      staff_id = p_staff_id,
      engagement_type = p_engagement_type,
      business_type = p_business_type,
      vehicle_id = p_vehicle_id,
      contract_id = v_contract_id,
      lead_label = trim(coalesce(p_lead_label, '')),
      referral_note = trim(coalesce(p_referral_note, ''))
    where id = p_assignment_id and status = 'open' and contract_id is null
    returning * into v_assignment;
    if not found then
      raise exception '契約作成前の進行中案件だけ修正できます。';
    end if;
  end if;
  return v_assignment;
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
  if not private.has_role(array['spot']::public.staff_role[]) then
    raise exception 'スポットスタッフ専用の契約処理です。';
  end if;
  select * into v_assignment from public.spot_assignments
  where id = p_assignment_id and staff_id = auth.uid() and engagement_type = 'full_service'
    and business_type = 'sale' and status = 'open' and vehicle_id is not null for update;
  if not found then
    raise exception '販売契約を入力できる担当案件が見つかりません。';
  end if;
  if char_length(trim(coalesce(p_customer_label, ''))) < 1 then
    raise exception 'お客様名を入力してください。';
  end if;
  if p_amount < 0 or (p_status = 'contracted' and p_amount <= 0) then
    raise exception '販売金額を確認してください。';
  end if;

  select * into v_vehicle from public.vehicles
  where id = v_assignment.vehicle_id and deleted_at is null for update;
  if not found then
    raise exception '担当車両が見つかりません。';
  end if;

  if v_assignment.contract_id is null then
    select * into v_contract from public.contracts
    where type = 'sale'
      and vehicle_id = v_vehicle.id
      and status <> 'cancelled'
      and deleted_at is null
    for update;

    if found then
      if exists (
        select 1 from public.spot_assignments
        where contract_id = v_contract.id and id <> v_assignment.id
      ) then
        raise exception 'この車両の販売契約は別の担当案件に紐づいています。';
      end if;
      update public.spot_assignments set contract_id = v_contract.id where id = v_assignment.id;
      v_assignment.contract_id := v_contract.id;
    end if;
  end if;

  if p_contract_id is not null and p_contract_id <> v_assignment.contract_id then
    raise exception '担当案件に紐づく契約だけ変更できます。';
  end if;

  if v_assignment.contract_id is null then
    insert into public.contracts(type, vehicle_id, customer_label, amount, status, contracted_on, sale_payment_method)
    values (
      'sale', v_vehicle.id, trim(p_customer_label), p_amount,
      case when p_status = 'contracted' then 'draft'::public.contract_status else p_status end,
      p_contracted_on, p_payment_method
    )
    returning * into v_contract;
    update public.spot_assignments set contract_id = v_contract.id where id = v_assignment.id;
  else
    select * into v_contract from public.contracts
    where id = v_assignment.contract_id and type = 'sale' and deleted_at is null for update;
    if not found then
      raise exception '担当案件の販売契約が見つかりません。';
    end if;
    if v_contract.status = 'contracted' then
      raise exception '契約済みの内容は修正できません。';
    end if;
    update public.contracts set
      customer_label = trim(p_customer_label),
      amount = p_amount,
      status = case when p_status = 'contracted' then status else p_status end,
      contracted_on = p_contracted_on,
      sale_payment_method = p_payment_method
    where id = v_contract.id returning * into v_contract;
  end if;

  if p_status = 'contracted' then
    if v_vehicle.status not in ('arrived', 'for_sale') then
      raise exception '入庫済みまたは販売中の車両だけ販売契約できます。';
    end if;
    update public.vehicles set status = 'reserved', sale_price = p_amount where id = v_vehicle.id;
    update public.contracts set status = 'contracted' where id = v_contract.id;
    insert into public.cashflows(
      vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on
    )
    values (
      v_vehicle.id, 'incoming', 'sale_receipt', '販売代金 ' || trim(p_customer_label),
      p_amount, 0, 'unprocessed', p_payment_method, p_contracted_on
    );
  end if;
  return v_contract.id;
end;
$$;

revoke all on function public.save_spot_assignment(uuid, uuid, public.staff_engagement_type, public.staff_business_type, uuid, text, text) from public, anon;
grant execute on function public.save_spot_assignment(uuid, uuid, public.staff_engagement_type, public.staff_business_type, uuid, text, text) to authenticated;
revoke all on function public.save_spot_sale_contract(uuid, uuid, text, bigint, public.contract_status, date, public.payment_method) from public, anon;
grant execute on function public.save_spot_sale_contract(uuid, uuid, text, bigint, public.contract_status, date, public.payment_method) to authenticated;
