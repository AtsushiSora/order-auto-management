-- 事業主・通常スタッフが担当案件を介さず、既存の契約サイトへ安全に引き継げるようにする。

alter table public.contract_handoffs
  alter column assignment_id drop not null;

create unique index contract_handoffs_open_direct_contract_key
on public.contract_handoffs(contract_id)
where status = 'issued' and assignment_id is null;

create or replace function public.issue_direct_contract_handoff(p_contract_id uuid)
returns table (completion_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '契約サイトへ引き継ぐ権限がありません。';
  end if;

  select * into v_contract from public.contracts c
  where c.id = p_contract_id and c.deleted_at is null
  for update;
  if not found or v_contract.status <> 'awaiting_signature' then
    raise exception '署名待ちの契約だけ契約サイトへ引き継げます。';
  end if;
  if v_contract.type = 'sale' and v_contract.amount <= 0 then
    raise exception '販売金額は1円以上で入力してください。';
  end if;

  update public.contract_handoffs h set status = 'revoked'
  where h.contract_id = v_contract.id and h.assignment_id is null and h.status = 'issued';

  insert into public.contract_handoffs(
    assignment_id, contract_id, contract_type, token_hash, issued_by, expires_at
  ) values (
    null, v_contract.id, v_contract.type,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expires_at
  );

  return query select v_token, v_expires_at;
end;
$$;

create or replace function private.apply_contract_handoff(
  p_handoff_id uuid,
  p_external_contract_id text
)
returns jsonb
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
  v_actor_id uuid;
  v_error_code text;
begin
  select * into v_handoff from public.contract_handoffs h
  where h.id = p_handoff_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error_code', 'invalid_link');
  end if;

  if v_handoff.status = 'completed' then
    if v_handoff.external_contract_id is distinct from trim(p_external_contract_id) then
      return jsonb_build_object('success', false, 'error_code', 'link_already_used');
    end if;
    return jsonb_build_object(
      'success', true,
      'assignment_id', v_handoff.assignment_id,
      'contract_id', v_handoff.contract_id,
      'contract_status', 'contracted'
    );
  end if;
  if v_handoff.status <> 'issued' then
    return jsonb_build_object('success', false, 'error_code', 'invalid_link');
  end if;
  if v_handoff.external_contract_id is not null
     and v_handoff.external_contract_id is distinct from trim(p_external_contract_id) then
    return jsonb_build_object('success', false, 'error_code', 'link_already_used');
  end if;
  if v_handoff.expires_at <= now() then
    return private.record_contract_handoff_failure(v_handoff.id, 'expired', p_external_contract_id);
  end if;

  begin
    if v_handoff.assignment_id is not null then
      select * into v_assignment from public.spot_assignments a
      where a.id = v_handoff.assignment_id and a.contract_id = v_handoff.contract_id
        and a.engagement_type = 'full_service' and a.status = 'open' for update;
      if not found then raise exception 'assignment_unavailable'; end if;
      v_actor_id := v_assignment.staff_id;
    else
      v_actor_id := v_handoff.issued_by;
    end if;

    select * into v_contract from public.contracts c
    where c.id = v_handoff.contract_id and c.status = 'awaiting_signature'
      and c.deleted_at is null for update;
    if not found then raise exception 'contract_unavailable'; end if;

    if v_contract.type = 'purchase' then
      insert into public.vehicles(
        name, chassis_number, status, acquisition_source, purchase_price, asking_price,
        storage_location, planned_arrival_date, created_by, updated_by
      ) values (
        v_contract.vehicle_name, v_contract.chassis_number, 'planned_arrival', v_contract.acquisition_source,
        v_contract.amount, v_contract.asking_price, v_contract.storage_location, v_contract.planned_arrival_date,
        v_actor_id, v_actor_id
      ) returning id into v_vehicle_id;
      update public.contracts c set vehicle_id = v_vehicle_id, status = 'contracted', updated_by = v_actor_id
      where c.id = v_contract.id;
      if v_handoff.assignment_id is not null then
        update public.spot_assignments a set vehicle_id = v_vehicle_id, updated_by = v_actor_id
        where a.id = v_assignment.id;
      end if;
      if v_contract.amount > 0 then
        insert into public.cashflows(
          vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on,
          created_by, updated_by
        ) values (
          v_vehicle_id, 'outgoing', 'purchase_payment', '買取代金 ' || v_contract.customer_label,
          v_contract.amount, 0, 'unprocessed', v_contract.purchase_payment_method, v_contract.planned_arrival_date,
          v_actor_id, v_actor_id
        );
      end if;
    else
      select * into v_vehicle from public.vehicles v
      where v.id = v_contract.vehicle_id and v.deleted_at is null for update;
      if not found or v_vehicle.status not in ('arrived', 'for_sale') then
        raise exception 'vehicle_not_available';
      end if;
      update public.vehicles v set status = 'reserved', sale_price = v_contract.amount, updated_by = v_actor_id
      where v.id = v_vehicle.id;
      update public.contracts c set status = 'contracted', updated_by = v_actor_id
      where c.id = v_contract.id;
      insert into public.cashflows(
        vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on,
        created_by, updated_by
      ) values (
        v_vehicle.id, 'incoming', 'sale_receipt', '販売代金 ' || v_contract.customer_label,
        v_contract.amount, 0, 'unprocessed', v_contract.sale_payment_method, v_contract.contracted_on,
        v_actor_id, v_actor_id
      );
    end if;

    update public.contract_handoffs h set
      status = 'completed',
      external_contract_id = trim(p_external_contract_id),
      completed_at = now(),
      last_error_code = null,
      last_error_at = null,
      last_attempted_at = now()
    where h.id = v_handoff.id;

    return jsonb_build_object(
      'success', true,
      'assignment_id', v_handoff.assignment_id,
      'contract_id', v_contract.id,
      'contract_status', 'contracted'
    );
  exception when others then
    v_error_code := case sqlerrm
      when 'assignment_unavailable' then 'assignment_unavailable'
      when 'contract_unavailable' then 'contract_unavailable'
      when 'vehicle_not_available' then 'vehicle_not_available'
      else 'unexpected_error'
    end;
    return private.record_contract_handoff_failure(v_handoff.id, v_error_code, p_external_contract_id);
  end;
end;
$$;

revoke all on function public.issue_direct_contract_handoff(uuid) from public, anon;
grant execute on function public.issue_direct_contract_handoff(uuid) to authenticated;
