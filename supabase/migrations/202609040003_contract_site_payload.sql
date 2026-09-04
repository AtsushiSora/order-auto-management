-- 管理画面では下書きを入力せず、契約サイトで確定した内容を完了時に反映する。

create or replace function public.issue_direct_contract_handoff(p_contract_id uuid)
returns table (completion_token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '契約サイトへ引き継ぐ権限がありません。';
  end if;
  select * into v_contract from public.contracts c where c.id = p_contract_id and c.deleted_at is null for update;
  if not found or v_contract.status <> 'awaiting_signature' then
    raise exception '署名待ちの契約だけ契約サイトへ引き継げます。';
  end if;
  update public.contract_handoffs h set status = 'revoked'
  where h.contract_id = v_contract.id and h.assignment_id is null and h.status = 'issued';
  insert into public.contract_handoffs(assignment_id, contract_id, contract_type, token_hash, issued_by, expires_at)
  values (null, v_contract.id, v_contract.type, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expires_at);
  return query select v_token, v_expires_at;
end;
$$;

create or replace function public.complete_contract_handoff_v2(
  p_completion_token text,
  p_external_contract_id text,
  p_contract_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_handoff public.contract_handoffs;
  v_amount bigint;
  v_payment public.payment_method;
begin
  if p_completion_token !~ '^[0-9a-f]{64}$'
     or char_length(trim(coalesce(p_external_contract_id, ''))) not between 1 and 160
     or jsonb_typeof(coalesce(p_contract_data, '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('success', false, 'error_code', 'invalid_request');
  end if;
  select * into v_handoff from public.contract_handoffs h
  where h.token_hash = encode(extensions.digest(p_completion_token, 'sha256'), 'hex') for update;
  if not found then return jsonb_build_object('success', false, 'error_code', 'invalid_link'); end if;
  if v_handoff.status = 'completed' then
    return private.apply_contract_handoff(v_handoff.id, trim(p_external_contract_id));
  end if;

  begin
    v_amount := nullif(regexp_replace(coalesce(p_contract_data->>'amount', ''), '[^0-9]', '', 'g'), '')::bigint;
  exception when others then
    return jsonb_build_object('success', false, 'error_code', 'invalid_request');
  end;
  v_payment := case p_contract_data->>'paymentMethod'
    when '現金' then 'cash'::public.payment_method
    when 'ローン' then 'loan_company'::public.payment_method
    when 'ローン会社' then 'loan_company'::public.payment_method
    when 'カード' then 'card'::public.payment_method
    when 'その他' then 'other'::public.payment_method
    else 'bank_transfer'::public.payment_method
  end;

  if v_handoff.contract_type = 'purchase' then
    if v_amount is null or v_amount < 0 or nullif(btrim(p_contract_data->>'customerLabel'), '') is null or nullif(btrim(p_contract_data->>'vehicleName'), '') is null then
      return jsonb_build_object('success', false, 'error_code', 'invalid_request');
    end if;
    update public.contracts set
      customer_label = left(btrim(p_contract_data->>'customerLabel'), 160),
      amount = v_amount,
      contracted_on = coalesce(nullif(p_contract_data->>'contractedOn', '')::date, current_date),
      vehicle_name = left(btrim(p_contract_data->>'vehicleName'), 160),
      chassis_number = nullif(left(btrim(coalesce(p_contract_data->>'chassisNumber', '')), 80), ''),
      planned_arrival_date = coalesce(nullif(p_contract_data->>'plannedArrivalDate', '')::date, current_date),
      storage_location = coalesce(nullif(left(btrim(coalesce(p_contract_data->>'storageLocation', '')), 160), ''), '自宅'),
      purchase_payment_method = v_payment
    where id = v_handoff.contract_id and status = 'awaiting_signature';
  else
    if v_amount is null or v_amount <= 0 or nullif(btrim(p_contract_data->>'customerLabel'), '') is null then
      return jsonb_build_object('success', false, 'error_code', 'invalid_request');
    end if;
    update public.contracts set
      customer_label = left(btrim(p_contract_data->>'customerLabel'), 160),
      amount = v_amount,
      contracted_on = coalesce(nullif(p_contract_data->>'contractedOn', '')::date, current_date),
      sale_payment_method = v_payment
    where id = v_handoff.contract_id and status = 'awaiting_signature';
  end if;
  return private.apply_contract_handoff(v_handoff.id, trim(p_external_contract_id));
exception when others then
  return jsonb_build_object('success', false, 'error_code', 'invalid_request');
end;
$$;

revoke all on function public.complete_contract_handoff_v2(text, text, jsonb) from public;
grant execute on function public.complete_contract_handoff_v2(text, text, jsonb) to anon, authenticated;
