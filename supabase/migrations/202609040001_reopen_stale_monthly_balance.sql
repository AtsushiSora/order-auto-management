-- 月次確定後に入出金が追加・訂正された場合だけ、残高照合の再保存を許可する。
create or replace function public.save_monthly_balance_check(
  p_target_month date,
  p_opening_cash_balance bigint,
  p_opening_bank_balance bigint,
  p_actual_cash_balance bigint,
  p_actual_bank_balance bigint,
  p_note text default '',
  p_confirm boolean default false
)
returns public.monthly_balance_checks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.monthly_balance_checks;
  v_cash_movement bigint := 0;
  v_bank_movement bigint := 0;
  v_system_cash bigint;
  v_system_bank bigint;
  v_cash_difference bigint;
  v_bank_difference bigint;
  v_saved public.monthly_balance_checks;
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '月次残高を保存する権限がありません。';
  end if;
  if p_confirm and not private.has_role(array['owner', 'accounting']::public.staff_role[]) then
    raise exception '月次確定は事業主または経理担当だけができます。';
  end if;
  if p_target_month is null or p_target_month <> date_trunc('month', p_target_month)::date then
    raise exception '対象月を確認してください。';
  end if;
  if p_target_month > date_trunc('month', current_date)::date then
    raise exception '未来の月は保存できません。';
  end if;
  if least(p_opening_cash_balance, p_opening_bank_balance, p_actual_cash_balance, p_actual_bank_balance) < 0 then
    raise exception '残高は0円以上で入力してください。';
  end if;

  select * into v_existing
  from public.monthly_balance_checks
  where target_month = p_target_month
  for update;

  select
    coalesce(sum(case when event.method = 'cash' then case when cashflow.direction = 'incoming' then event.amount else -event.amount end else 0 end), 0)::bigint,
    coalesce(sum(case when event.method = 'bank_transfer' then case when cashflow.direction = 'incoming' then event.amount else -event.amount end else 0 end), 0)::bigint
  into v_cash_movement, v_bank_movement
  from public.cashflow_events event
  join public.cashflows cashflow on cashflow.id = event.cashflow_id
  where event.processed_on >= p_target_month
    and event.processed_on < (p_target_month + interval '1 month')::date;

  if found and v_existing.status = 'confirmed'
    and v_existing.cash_movement = v_cash_movement
    and v_existing.bank_movement = v_bank_movement then
    raise exception '確定済みの月は変更できません。';
  end if;

  v_system_cash := p_opening_cash_balance + v_cash_movement;
  v_system_bank := p_opening_bank_balance + v_bank_movement;
  if v_system_cash < 0 or v_system_bank < 0 then
    raise exception '期首残高より支払いが多く、システム残高がマイナスになります。';
  end if;
  v_cash_difference := p_actual_cash_balance - v_system_cash;
  v_bank_difference := p_actual_bank_balance - v_system_bank;
  if p_confirm and (v_cash_difference <> 0 or v_bank_difference <> 0) then
    raise exception '現金と事業用口座の差額が0円になるまで月次確定できません。';
  end if;

  insert into public.monthly_balance_checks(
    target_month, opening_cash_balance, opening_bank_balance, cash_movement, bank_movement,
    system_cash_balance, system_bank_balance, actual_cash_balance, actual_bank_balance,
    cash_difference, bank_difference, status, note, confirmed_at, confirmed_by, created_by, updated_by
  ) values (
    p_target_month, p_opening_cash_balance, p_opening_bank_balance, v_cash_movement, v_bank_movement,
    v_system_cash, v_system_bank, p_actual_cash_balance, p_actual_bank_balance,
    v_cash_difference, v_bank_difference, case when p_confirm then 'confirmed' else 'draft' end,
    trim(coalesce(p_note, '')), case when p_confirm then now() else null end,
    case when p_confirm then auth.uid() else null end, auth.uid(), auth.uid()
  )
  on conflict (target_month) do update set
    opening_cash_balance = excluded.opening_cash_balance,
    opening_bank_balance = excluded.opening_bank_balance,
    cash_movement = excluded.cash_movement,
    bank_movement = excluded.bank_movement,
    system_cash_balance = excluded.system_cash_balance,
    system_bank_balance = excluded.system_bank_balance,
    actual_cash_balance = excluded.actual_cash_balance,
    actual_bank_balance = excluded.actual_bank_balance,
    cash_difference = excluded.cash_difference,
    bank_difference = excluded.bank_difference,
    status = excluded.status,
    note = excluded.note,
    confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by,
    updated_by = auth.uid()
  returning * into v_saved;
  return v_saved;
end;
$$;

revoke all on function public.save_monthly_balance_check(date, bigint, bigint, bigint, bigint, text, boolean) from public, anon;
grant execute on function public.save_monthly_balance_check(date, bigint, bigint, bigint, bigint, text, boolean) to authenticated;
