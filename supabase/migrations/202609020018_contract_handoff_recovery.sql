-- 契約完了の反映失敗を安全な分類だけで記録し、事業主が同じ連携を再試行できるようにする。

alter table public.contract_handoffs
  add column failure_count integer not null default 0 check (failure_count >= 0),
  add column last_error_code text check (
    last_error_code is null or last_error_code in (
      'expired', 'assignment_unavailable', 'contract_unavailable',
      'vehicle_not_available', 'unexpected_error'
    )
  ),
  add column last_error_at timestamptz,
  add column last_attempted_at timestamptz;

create or replace function private.record_contract_handoff_failure(
  p_handoff_id uuid,
  p_error_code text,
  p_external_contract_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.contract_handoffs h set
    failure_count = h.failure_count + 1,
    last_error_code = p_error_code,
    last_error_at = now(),
    last_attempted_at = now(),
    external_contract_id = coalesce(h.external_contract_id, trim(p_external_contract_id))
  where h.id = p_handoff_id and h.status = 'issued';

  return jsonb_build_object('success', false, 'error_code', p_error_code);
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
    select * into v_assignment from public.spot_assignments a
    where a.id = v_handoff.assignment_id and a.contract_id = v_handoff.contract_id
      and a.engagement_type = 'full_service' and a.status = 'open' for update;
    if not found then raise exception 'assignment_unavailable'; end if;

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
        raise exception 'vehicle_not_available';
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
      status = 'completed',
      external_contract_id = trim(p_external_contract_id),
      completed_at = now(),
      last_error_code = null,
      last_error_at = null,
      last_attempted_at = now()
    where h.id = v_handoff.id;

    return jsonb_build_object(
      'success', true,
      'assignment_id', v_assignment.id,
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

drop function public.complete_contract_handoff(text, text);

create function public.complete_contract_handoff(p_completion_token text, p_external_contract_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff_id uuid;
begin
  if p_completion_token !~ '^[0-9a-f]{64}$'
     or char_length(trim(coalesce(p_external_contract_id, ''))) not between 1 and 160 then
    return jsonb_build_object('success', false, 'error_code', 'invalid_request');
  end if;

  select h.id into v_handoff_id from public.contract_handoffs h
  where h.token_hash = encode(extensions.digest(p_completion_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('success', false, 'error_code', 'invalid_link');
  end if;

  return private.apply_contract_handoff(v_handoff_id, trim(p_external_contract_id));
end;
$$;

create function public.retry_contract_handoff(p_handoff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff public.contract_handoffs;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '事業主だけが契約連携を再試行できます。';
  end if;

  select * into v_handoff from public.contract_handoffs h
  where h.id = p_handoff_id and h.status = 'issued' for update;
  if not found then raise exception '再試行できる契約連携が見つかりません。'; end if;
  if v_handoff.failure_count = 0 or v_handoff.external_contract_id is null then
    raise exception '外部契約からの失敗記録がある連携だけ再試行できます。';
  end if;
  if v_handoff.expires_at <= now() then
    raise exception '有効期限切れのため再試行できません。担当案件から契約を開き直してください。';
  end if;

  return private.apply_contract_handoff(v_handoff.id, v_handoff.external_contract_id);
end;
$$;

revoke all on function private.record_contract_handoff_failure(uuid, text, text) from public, anon, authenticated;
revoke all on function private.apply_contract_handoff(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_contract_handoff(text, text) from public;
grant execute on function public.complete_contract_handoff(text, text) to anon, authenticated;
revoke all on function public.retry_contract_handoff(uuid) from public, anon;
grant execute on function public.retry_contract_handoff(uuid) to authenticated;
