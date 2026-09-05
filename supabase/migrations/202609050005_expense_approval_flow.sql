-- スタッフの経費申請を、事業主の承認後にだけ正式な経費・支払い予定へ変換する。

alter table public.approvals
  alter column vehicle_id drop not null,
  add column approval_type text not null default 'general' check (approval_type in ('general', 'expense_request')),
  add column expense_id uuid references public.expenses(id) on delete restrict,
  add column expense_category text check (expense_category is null or char_length(trim(expense_category)) between 1 and 80),
  add column expense_description text check (expense_description is null or char_length(trim(expense_description)) between 1 and 500),
  add column expense_amount bigint check (expense_amount is null or expense_amount > 0),
  add column expense_incurred_on date,
  add column expense_payment_method public.payment_method,
  add column evidence_missing_reason text check (evidence_missing_reason is null or char_length(trim(evidence_missing_reason)) <= 500),
  add column expense_workflow_status text check (expense_workflow_status is null or expense_workflow_status in ('pending', 'returned', 'approved', 'rejected', 'cancelled')),
  add constraint approval_expense_request_fields check (
    approval_type <> 'expense_request'
    or (
      expense_category is not null
      and expense_description is not null
      and expense_amount is not null
      and expense_incurred_on is not null
      and expense_workflow_status is not null
    )
  );

create index approvals_expense_request_idx
  on public.approvals(expense_workflow_status, created_at desc)
  where approval_type = 'expense_request';

alter table public.attachments
  add column approval_id uuid references public.approvals(id) on delete restrict;

alter table public.attachments drop constraint attachment_has_parent;
alter table public.attachments add constraint attachment_has_parent
  check (num_nonnulls(vehicle_id, contract_id, expense_id, approval_id) = 1);

create index attachments_approval_idx on public.attachments(approval_id) where approval_id is not null;

-- 通常スタッフは直接経費を作らず、必ず申請を通す。
drop policy if exists expenses_business_insert on public.expenses;
create policy expenses_business_insert
on public.expenses for insert to authenticated
with check (
  private.has_role(array['owner', 'accounting']::public.staff_role[])
  and created_by = (select auth.uid())
);

drop policy if exists expenses_business_update on public.expenses;
create policy expenses_business_update
on public.expenses for update to authenticated
using (private.has_role(array['owner', 'accounting']::public.staff_role[]))
with check (private.has_role(array['owner', 'accounting']::public.staff_role[]));

drop policy if exists approvals_operations_read on public.approvals;
create policy approvals_operations_read
on public.approvals for select to authenticated
using (
  private.has_role(array['owner']::public.staff_role[])
  or (
    private.has_role(array['regular', 'accounting']::public.staff_role[])
    and (
      (approval_type = 'expense_request' and requested_by = (select auth.uid()))
      or approval_type = 'general'
    )
  )
);

drop policy if exists approvals_operations_insert on public.approvals;
create policy approvals_operations_insert
on public.approvals for insert to authenticated
with check (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and requested_by = (select auth.uid())
);

drop policy if exists attachments_business_read on public.attachments;
create policy attachments_business_read
on public.attachments for select to authenticated
using (
  private.has_role(array['owner']::public.staff_role[])
  or (
    private.has_role(array['regular', 'accounting']::public.staff_role[])
    and (
      approval_id is null
      or exists (
        select 1 from public.approvals
        where approvals.id = attachments.approval_id
          and approvals.requested_by = (select auth.uid())
      )
    )
  )
);

drop policy if exists attachments_operations_insert on public.attachments;
create policy attachments_operations_insert
on public.attachments for insert to authenticated
with check (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and created_by = (select auth.uid())
  and (
    approval_id is null
    or exists (
      select 1 from public.approvals
      where approvals.id = attachments.approval_id
        and approvals.approval_type = 'expense_request'
        and approvals.requested_by = (select auth.uid())
        and approvals.expense_workflow_status in ('pending', 'returned')
    )
  )
);

drop policy if exists order_auto_private_upload on storage.objects;
create policy order_auto_private_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and (storage.foldername(name))[1] in ('vehicles', 'contracts', 'expenses', 'expense-requests')
);

create or replace function public.save_expense_request(
  p_approval_id uuid,
  p_vehicle_id uuid,
  p_category text,
  p_description text,
  p_amount bigint,
  p_incurred_on date,
  p_evidence_missing_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approvals;
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '経費を申請する権限がありません。';
  end if;
  if char_length(trim(coalesce(p_category, ''))) < 1 then raise exception '費用項目を入力してください。'; end if;
  if char_length(trim(coalesce(p_description, ''))) < 1 then raise exception '内容を入力してください。'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '金額は1円以上で入力してください。'; end if;
  if p_incurred_on is null then raise exception '発生日を入力してください。'; end if;
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles where id = p_vehicle_id and deleted_at is null
  ) then raise exception '対象車両が見つかりません。'; end if;

  if p_approval_id is null then
    insert into public.approvals (
      approval_type, vehicle_id, title, status,
      expense_category, expense_description, expense_amount, expense_incurred_on,
      evidence_missing_reason, expense_workflow_status
    ) values (
      'expense_request', p_vehicle_id, '経費申請 ' || trim(p_category) || '：' || left(trim(p_description), 100), 'pending',
      trim(p_category), trim(p_description), p_amount, p_incurred_on,
      nullif(trim(coalesce(p_evidence_missing_reason, '')), ''), 'pending'
    ) returning * into v_request;
  else
    select * into v_request from public.approvals
    where id = p_approval_id and approval_type = 'expense_request'
    for update;
    if v_request.id is null then raise exception '対象の経費申請が見つかりません。'; end if;
    if v_request.requested_by <> auth.uid() then raise exception '自分の経費申請だけを修正できます。'; end if;
    if v_request.expense_workflow_status <> 'returned' then raise exception '差し戻された申請だけを再申請できます。'; end if;

    update public.approvals set
      vehicle_id = p_vehicle_id,
      title = '経費申請 ' || trim(p_category) || '：' || left(trim(p_description), 100),
      status = 'pending',
      decided_by = null,
      decision_note = null,
      decided_at = null,
      expense_category = trim(p_category),
      expense_description = trim(p_description),
      expense_amount = p_amount,
      expense_incurred_on = p_incurred_on,
      evidence_missing_reason = nullif(trim(coalesce(p_evidence_missing_reason, '')), ''),
      expense_workflow_status = 'pending'
    where id = p_approval_id
    returning * into v_request;
  end if;
  return v_request.id;
end;
$$;

create or replace function public.decide_expense_request(
  p_approval_id uuid,
  p_decision text,
  p_payment_method public.payment_method,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approvals;
  v_expense_id uuid;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '経費申請を承認できるのは事業主だけです。';
  end if;
  if p_decision not in ('approved', 'returned', 'rejected') then raise exception '承認結果が不正です。'; end if;
  if p_decision <> 'approved' and char_length(trim(coalesce(p_note, ''))) < 1 then
    raise exception '差し戻し・却下の理由を入力してください。';
  end if;
  if p_decision = 'approved' and p_payment_method not in ('cash', 'bank_transfer') then
    raise exception '支払い方法は現金または振込を選択してください。';
  end if;

  select * into v_request from public.approvals
  where id = p_approval_id
    and approval_type = 'expense_request'
    and expense_workflow_status = 'pending'
  for update;
  if v_request.id is null then raise exception '承認待ちの経費申請が見つかりません。'; end if;

  if p_decision = 'approved'
    and char_length(trim(coalesce(v_request.evidence_missing_reason, ''))) < 1
    and not exists (select 1 from public.attachments where approval_id = v_request.id)
  then
    raise exception '証憑を添付するか、添付できない理由を確認してください。';
  end if;

  if p_decision = 'approved' then
    v_expense_id := public.save_expense(
      null,
      v_request.vehicle_id,
      v_request.expense_category,
      v_request.expense_description,
      v_request.expense_amount,
      'confirmed'::public.expense_status,
      'unpaid'::public.payment_status,
      p_payment_method,
      v_request.expense_incurred_on
    );
    update public.attachments
    set approval_id = null, expense_id = v_expense_id
    where approval_id = v_request.id;
  end if;

  update public.approvals set
    status = case when p_decision = 'approved' then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
    expense_workflow_status = p_decision,
    expense_payment_method = case when p_decision = 'approved' then p_payment_method else null end,
    expense_id = v_expense_id,
    decided_by = auth.uid(),
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    decided_at = now()
  where id = v_request.id;
  return v_expense_id;
end;
$$;

create or replace function public.cancel_expense_request(p_approval_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '経費申請を取り消す権限がありません。';
  end if;
  update public.approvals set
    status = 'rejected',
    expense_workflow_status = 'cancelled',
    decided_by = auth.uid(),
    decision_note = '申請者が取り消しました。',
    decided_at = now()
  where id = p_approval_id
    and approval_type = 'expense_request'
    and requested_by = auth.uid()
    and expense_workflow_status in ('pending', 'returned');
  if not found then raise exception '取り消せる経費申請が見つかりません。'; end if;
end;
$$;

revoke all on function public.save_expense_request(uuid, uuid, text, text, bigint, date, text) from public, anon;
grant execute on function public.save_expense_request(uuid, uuid, text, text, bigint, date, text) to authenticated;
revoke all on function public.decide_expense_request(uuid, text, public.payment_method, text) from public, anon;
grant execute on function public.decide_expense_request(uuid, text, public.payment_method, text) to authenticated;
revoke all on function public.cancel_expense_request(uuid) from public, anon;
grant execute on function public.cancel_expense_request(uuid) to authenticated;
