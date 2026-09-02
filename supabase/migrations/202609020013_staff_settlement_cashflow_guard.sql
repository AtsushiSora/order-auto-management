-- スタッフ精算由来の入出金は専用RPCで完了し、精算履歴との状態ずれを防ぐ。

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
  if v_cashflow.source_staff_settlement_id is not null then
    raise exception 'スタッフ精算由来の入出金はスタッフ精算の完了処理を使用してください。';
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
