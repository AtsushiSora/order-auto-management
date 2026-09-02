-- 確定経費を入出金へ自動連携し、経費修正時も金額と支払い状態を一致させる。

alter table public.expenses
  add column payment_method public.payment_method not null default 'bank_transfer';

alter table public.cashflows
  add column source_expense_id uuid references public.expenses(id) on delete restrict;

create unique index cashflows_one_active_payment_per_expense
  on public.cashflows(source_expense_id)
  where source_expense_id is not null
    and deleted_at is null;

create or replace function public.save_expense(
  p_expense_id uuid,
  p_vehicle_id uuid,
  p_category text,
  p_description text,
  p_amount bigint,
  p_expense_status public.expense_status,
  p_payment_status public.payment_status,
  p_payment_method public.payment_method,
  p_incurred_on date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_cashflow public.cashflows;
  v_processed_amount bigint;
  v_cashflow_status public.cashflow_status;
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '経費を変更する権限がありません。';
  end if;
  if char_length(trim(p_category)) < 1 then
    raise exception '費用項目を入力してください。';
  end if;
  if char_length(trim(p_description)) < 1 then
    raise exception '内容を入力してください。';
  end if;
  if p_amount <= 0 then
    raise exception '金額は1円以上で入力してください。';
  end if;
  if p_incurred_on is null then
    raise exception '発生日を入力してください。';
  end if;
  if p_expense_status = 'planned' and p_payment_status = 'paid' then
    raise exception '予定費用を支払済みにはできません。';
  end if;
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles where id = p_vehicle_id and deleted_at is null
  ) then
    raise exception '対象車両が見つかりません。';
  end if;

  if p_expense_id is null then
    insert into public.expenses (
      vehicle_id,
      category,
      description,
      amount,
      expense_status,
      payment_status,
      payment_method,
      incurred_on
    ) values (
      p_vehicle_id,
      trim(p_category),
      trim(p_description),
      p_amount,
      p_expense_status,
      case when p_expense_status = 'planned' then 'unpaid'::public.payment_status else p_payment_status end,
      p_payment_method,
      p_incurred_on
    ) returning * into v_expense;
  else
    select * into v_expense
    from public.expenses
    where id = p_expense_id
      and deleted_at is null
    for update;

    if v_expense.id is null then
      raise exception '対象の経費が見つかりません。';
    end if;

    update public.expenses
    set
      vehicle_id = p_vehicle_id,
      category = trim(p_category),
      description = trim(p_description),
      amount = p_amount,
      expense_status = p_expense_status,
      payment_status = case when p_expense_status = 'planned' then 'unpaid'::public.payment_status else p_payment_status end,
      payment_method = p_payment_method,
      incurred_on = p_incurred_on
    where id = p_expense_id
    returning * into v_expense;
  end if;

  select * into v_cashflow
  from public.cashflows
  where source_expense_id = v_expense.id
    and deleted_at is null
  for update;

  if p_expense_status = 'planned' then
    if v_cashflow.id is not null and v_cashflow.processed_amount > 0 then
      raise exception '支払い処理済みの経費は予定費用へ戻せません。';
    end if;
    if v_cashflow.id is not null then
      update public.cashflows
      set deleted_at = now(), deleted_by = auth.uid()
      where id = v_cashflow.id;
    end if;
    return v_expense.id;
  end if;

  if v_cashflow.id is not null then
    if p_payment_status = 'unpaid' and v_cashflow.status = 'completed' then
      raise exception '支払済みの取消は入出金の訂正機能から行ってください。';
    end if;
    if p_amount < v_cashflow.processed_amount then
      raise exception '金額を支払い済み額より少なくできません。';
    end if;
    v_processed_amount := case when p_payment_status = 'paid' then p_amount else v_cashflow.processed_amount end;
    v_cashflow_status := case
      when v_processed_amount = 0 then 'unprocessed'::public.cashflow_status
      when v_processed_amount >= p_amount then 'completed'::public.cashflow_status
      else 'partial'::public.cashflow_status
    end;

    update public.cashflows
    set
      vehicle_id = p_vehicle_id,
      description = '経費 ' || trim(p_category) || '：' || trim(p_description),
      amount = p_amount,
      processed_amount = v_processed_amount,
      status = v_cashflow_status,
      method = p_payment_method,
      scheduled_on = p_incurred_on,
      processed_on = case
        when v_cashflow_status = 'completed' then coalesce(processed_on, current_date)
        when v_cashflow_status = 'unprocessed' then null
        else processed_on
      end
    where id = v_cashflow.id;
  else
    insert into public.cashflows (
      vehicle_id,
      source_expense_id,
      direction,
      kind,
      description,
      amount,
      processed_amount,
      status,
      method,
      scheduled_on,
      processed_on
    ) values (
      p_vehicle_id,
      v_expense.id,
      'outgoing',
      'expense_payment',
      '経費 ' || trim(p_category) || '：' || trim(p_description),
      p_amount,
      case when p_payment_status = 'paid' then p_amount else 0 end,
      case when p_payment_status = 'paid' then 'completed'::public.cashflow_status else 'unprocessed'::public.cashflow_status end,
      p_payment_method,
      p_incurred_on,
      case when p_payment_status = 'paid' then current_date else null end
    );
  end if;

  return v_expense.id;
end;
$$;

create or replace function public.complete_cashflow(
  p_cashflow_id uuid,
  p_processed_on date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cashflow public.cashflows;
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '入出金を完了する権限がありません。';
  end if;
  if p_processed_on is null then
    raise exception '処理日を入力してください。';
  end if;
  if p_processed_on > current_date then
    raise exception '処理日に未来の日付は指定できません。';
  end if;

  select * into v_cashflow
  from public.cashflows
  where id = p_cashflow_id
    and deleted_at is null
  for update;

  if v_cashflow.id is null then
    raise exception '対象の入出金が見つかりません。';
  end if;
  if v_cashflow.status = 'completed' then
    return;
  end if;

  update public.cashflows
  set
    processed_amount = amount,
    status = 'completed',
    processed_on = p_processed_on
  where id = p_cashflow_id;

  if v_cashflow.source_expense_id is not null then
    update public.expenses
    set payment_status = 'paid'
    where id = v_cashflow.source_expense_id
      and deleted_at is null;
  end if;
end;
$$;

revoke all on function public.save_expense(
  uuid, uuid, text, text, bigint, public.expense_status, public.payment_status, public.payment_method, date
) from public, anon;
grant execute on function public.save_expense(
  uuid, uuid, text, text, bigint, public.expense_status, public.payment_status, public.payment_method, date
) to authenticated;

