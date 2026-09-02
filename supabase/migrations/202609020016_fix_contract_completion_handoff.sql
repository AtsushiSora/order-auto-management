-- 015で返却列名とspot_assignments.contract_idが曖昧になる箇所を明示する。

create or replace function public.complete_contract_handoff(p_completion_token text, p_external_contract_id text)
returns table (assignment_id uuid, contract_id uuid, contract_status public.contract_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff public.contract_handoffs;
  v_assignment public.spot_assignments;
  v_contract public.contracts;
  v_vehicle public.vehicles;
  v_vehicle_id uuid;
begin
  if p_completion_token !~ '^[0-9a-f]{64}$' then raise exception '完了トークンが正しくありません。'; end if;
  if char_length(trim(coalesce(p_external_contract_id, ''))) not between 1 and 160 then
    raise exception '契約システム側の契約IDが正しくありません。';
  end if;

  select * into v_handoff from public.contract_handoffs h
  where h.token_hash = encode(extensions.digest(p_completion_token, 'sha256'), 'hex')
  for update;
  if not found then raise exception '完了トークンを確認できません。'; end if;
  if v_handoff.status = 'completed' then
    if v_handoff.external_contract_id is distinct from trim(p_external_contract_id) then
      raise exception 'この完了トークンは使用済みです。';
    end if;
    return query select v_handoff.assignment_id, v_handoff.contract_id, 'contracted'::public.contract_status;
    return;
  end if;
  if v_handoff.status <> 'issued' then raise exception 'この完了トークンは無効です。'; end if;
  if v_handoff.expires_at <= now() then raise exception '完了トークンの有効期限が切れています。'; end if;

  select * into v_assignment from public.spot_assignments a
  where a.id = v_handoff.assignment_id and a.contract_id = v_handoff.contract_id
    and a.engagement_type = 'full_service' and a.status = 'open' for update;
  if not found then raise exception '担当案件を確認できません。'; end if;
  select * into v_contract from public.contracts c
  where c.id = v_handoff.contract_id and c.status = 'awaiting_signature' and c.deleted_at is null for update;
  if not found then raise exception '署名待ちの契約を確認できません。'; end if;

  if v_contract.type = 'purchase' then
    insert into public.vehicles(
      name, chassis_number, status, acquisition_source, purchase_price, asking_price,
      storage_location, planned_arrival_date, created_by, updated_by
    ) values (
      v_contract.vehicle_name, v_contract.chassis_number, 'planned_arrival', v_contract.acquisition_source,
      v_contract.amount, v_contract.asking_price, v_contract.storage_location, v_contract.planned_arrival_date,
      v_assignment.staff_id, v_assignment.staff_id
    ) returning id into v_vehicle_id;
    update public.contracts c set vehicle_id = v_vehicle_id, status = 'contracted', updated_by = v_assignment.staff_id
    where c.id = v_contract.id;
    update public.spot_assignments a set vehicle_id = v_vehicle_id, updated_by = v_assignment.staff_id
    where a.id = v_assignment.id;
    if v_contract.amount > 0 then
      insert into public.cashflows(
        vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on,
        created_by, updated_by
      ) values (
        v_vehicle_id, 'outgoing', 'purchase_payment', '買取代金 ' || v_contract.customer_label,
        v_contract.amount, 0, 'unprocessed', v_contract.purchase_payment_method, v_contract.planned_arrival_date,
        v_assignment.staff_id, v_assignment.staff_id
      );
    end if;
  else
    select * into v_vehicle from public.vehicles v
    where v.id = v_contract.vehicle_id and v.deleted_at is null for update;
    if not found or v_vehicle.status not in ('arrived', 'for_sale') then
      raise exception '入庫済みまたは販売中の車両だけ販売契約を完了できます。';
    end if;
    update public.vehicles v set status = 'reserved', sale_price = v_contract.amount, updated_by = v_assignment.staff_id
    where v.id = v_vehicle.id;
    update public.contracts c set status = 'contracted', updated_by = v_assignment.staff_id
    where c.id = v_contract.id;
    insert into public.cashflows(
      vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on,
      created_by, updated_by
    ) values (
      v_vehicle.id, 'incoming', 'sale_receipt', '販売代金 ' || v_contract.customer_label,
      v_contract.amount, 0, 'unprocessed', v_contract.sale_payment_method, v_contract.contracted_on,
      v_assignment.staff_id, v_assignment.staff_id
    );
  end if;

  update public.contract_handoffs h set
    status = 'completed', external_contract_id = trim(p_external_contract_id), completed_at = now()
  where h.id = v_handoff.id;

  return query select v_assignment.id, v_contract.id, 'contracted'::public.contract_status;
end;
$$;
