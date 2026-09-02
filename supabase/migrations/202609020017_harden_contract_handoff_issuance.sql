-- 完了連携の発行履歴を監査対象にし、販売金額0円の連携を発行前に防ぐ。

create trigger contract_handoffs_audit after insert or update or delete on public.contract_handoffs
for each row execute function private.write_audit_log();

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
  from public.spot_assignments a
  where a.id = p_assignment_id
    and a.engagement_type = 'full_service'
    and a.status = 'open'
    and (
      (private.has_role(array['spot']::public.staff_role[]) and a.staff_id = auth.uid())
      or private.has_role(array['owner']::public.staff_role[])
    )
  for update;
  if not found then raise exception '完了連携できる担当案件が見つかりません。'; end if;
  if v_assignment.contract_id is null then raise exception '先に契約の入力を保存してください。'; end if;

  select * into v_contract from public.contracts c
  where c.id = v_assignment.contract_id and c.deleted_at is null for update;
  if not found or v_contract.status <> 'awaiting_signature' then
    raise exception '署名待ちの契約だけ完了連携できます。';
  end if;
  if (v_assignment.business_type = 'sale' and v_contract.type <> 'sale')
     or (v_assignment.business_type in ('purchase_auction', 'scrap') and v_contract.type <> 'purchase') then
    raise exception '担当案件と契約種別が一致しません。';
  end if;
  if v_contract.type = 'sale' and v_contract.amount <= 0 then
    raise exception '販売金額は1円以上で入力してください。';
  end if;

  update public.contract_handoffs h set status = 'revoked'
  where h.assignment_id = v_assignment.id and h.status = 'issued';

  insert into public.contract_handoffs(
    assignment_id, contract_id, contract_type, token_hash, issued_by, expires_at
  ) values (
    v_assignment.id, v_contract.id, v_contract.type,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expires_at
  );

  return query select v_token, v_expires_at;
end;
$$;
