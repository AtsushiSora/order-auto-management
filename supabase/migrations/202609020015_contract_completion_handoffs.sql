-- 別Supabaseで動く販売・買取契約から、使い捨てトークンで契約完了だけを安全に受け取る。

create table public.contract_handoffs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.spot_assignments(id) on delete restrict,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  contract_type public.contract_type not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'issued' check (status in ('issued', 'completed', 'revoked')),
  external_contract_id text check (external_contract_id is null or char_length(external_contract_id) between 1 and 160),
  issued_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  constraint contract_handoff_status_consistency check (
    (status in ('issued', 'revoked') and completed_at is null)
    or (status = 'completed' and completed_at is not null and external_contract_id is not null)
  )
);

create index contract_handoffs_assignment_idx on public.contract_handoffs(assignment_id, issued_at desc);
create unique index contract_handoffs_open_assignment_key on public.contract_handoffs(assignment_id) where status = 'issued';

create trigger contract_handoffs_audit after insert or update or delete on public.contract_handoffs
for each row execute function private.write_audit_log();

alter table public.contract_handoffs enable row level security;
grant select on public.contract_handoffs to authenticated;

create policy contract_handoffs_owner_read
on public.contract_handoffs for select to authenticated
using (private.has_role(array['owner']::public.staff_role[]));

create policy contract_handoffs_spot_self_read
on public.contract_handoffs for select to authenticated
using (
  private.has_role(array['spot']::public.staff_role[])
  and exists (
    select 1 from public.spot_assignments a
    where a.id = contract_handoffs.assignment_id and a.staff_id = (select auth.uid())
  )
);

-- 外部契約システムからの完了時はauth.uid()がない。
-- SECURITY DEFINER関数内の更新で既存の更新者をnullにしないよう保持する。
create or replace function private.set_updated_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' and auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.issue_contract_handoff(p_assignment_id uuid)
returns table (completion_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.spot_assignments;
  v_contract public.contracts;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := now() + interval '30 days';
begin
  select * into v_assignment
  from public.spot_assignments
  where id = p_assignment_id
    and engagement_type = 'full_service'
    and status = 'open'
    and (
      (private.has_role(array['spot']::public.staff_role[]) and staff_id = auth.uid())
      or private.has_role(array['owner']::public.staff_role[])
    )
  for update;
  if not found then raise exception '完了連携できる担当案件が見つかりません。'; end if;
  if v_assignment.contract_id is null then raise exception '先に契約の入力を保存してください。'; end if;

  select * into v_contract from public.contracts
  where id = v_assignment.contract_id and deleted_at is null for update;
  if not found or v_contract.status <> 'awaiting_signature' then
    raise exception '署名待ちの契約だけ完了連携できます。';
  end if;
  if (v_assignment.business_type = 'sale' and v_contract.type <> 'sale')
     or (v_assignment.business_type in ('purchase_auction', 'scrap') and v_contract.type <> 'purchase') then
    raise exception '担当案件と契約種別が一致しません。';
  end if;
  if v_contract.type = 'sale' and v_contract.amount <= 0 then raise exception '販売金額は1円以上で入力してください。'; end if;

  update public.contract_handoffs set status = 'revoked'
  where assignment_id = v_assignment.id and status = 'issued';

  insert into public.contract_handoffs(
    assignment_id, contract_id, contract_type, token_hash, issued_by, expires_at
  ) values (
    v_assignment.id, v_contract.id, v_contract.type,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expires_at
  );

  return query select v_token, v_expires_at;
end;
$$;

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

  select * into v_handoff from public.contract_handoffs
  where token_hash = encode(extensions.digest(p_completion_token, 'sha256'), 'hex')
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
  select * into v_contract from public.contracts
  where id = v_handoff.contract_id and status = 'awaiting_signature' and deleted_at is null for update;
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
    update public.contracts set vehicle_id = v_vehicle_id, status = 'contracted', updated_by = v_assignment.staff_id
    where id = v_contract.id;
    update public.spot_assignments set vehicle_id = v_vehicle_id, updated_by = v_assignment.staff_id
    where id = v_assignment.id;
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
    select * into v_vehicle from public.vehicles
    where id = v_contract.vehicle_id and deleted_at is null for update;
    if not found or v_vehicle.status not in ('arrived', 'for_sale') then
      raise exception '入庫済みまたは販売中の車両だけ販売契約を完了できます。';
    end if;
    update public.vehicles set status = 'reserved', sale_price = v_contract.amount, updated_by = v_assignment.staff_id
    where id = v_vehicle.id;
    update public.contracts set status = 'contracted', updated_by = v_assignment.staff_id
    where id = v_contract.id;
    insert into public.cashflows(
      vehicle_id, direction, kind, description, amount, processed_amount, status, method, scheduled_on,
      created_by, updated_by
    ) values (
      v_vehicle.id, 'incoming', 'sale_receipt', '販売代金 ' || v_contract.customer_label,
      v_contract.amount, 0, 'unprocessed', v_contract.sale_payment_method, v_contract.contracted_on,
      v_assignment.staff_id, v_assignment.staff_id
    );
  end if;

  update public.contract_handoffs set
    status = 'completed', external_contract_id = trim(p_external_contract_id), completed_at = now()
  where id = v_handoff.id;

  return query select v_assignment.id, v_contract.id, 'contracted'::public.contract_status;
end;
$$;

revoke all on function public.issue_contract_handoff(uuid) from public, anon;
grant execute on function public.issue_contract_handoff(uuid) to authenticated;
revoke all on function public.complete_contract_handoff(text, text) from public;
grant execute on function public.complete_contract_handoff(text, text) to anon, authenticated;
