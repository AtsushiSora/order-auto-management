-- 入庫確定と入出金完了を、権限・日付・入庫前支払い禁止を含めて安全に処理する。

create or replace function public.mark_vehicle_arrived(
  p_vehicle_id uuid,
  p_arrived_on date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '入庫処理を行う権限がありません。';
  end if;
  if p_arrived_on is null then
    raise exception '実際の入庫日を入力してください。';
  end if;
  if p_arrived_on > current_date then
    raise exception '実際の入庫日に未来の日付は指定できません。';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and deleted_at is null
  for update;

  if v_vehicle.id is null then
    raise exception '対象車両が見つかりません。';
  end if;
  if v_vehicle.status <> 'planned_arrival' then
    raise exception 'この車両はすでに入庫処理されています。';
  end if;

  update public.vehicles
  set
    status = 'arrived',
    arrived_at = p_arrived_on
  where id = p_vehicle_id;
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
end;
$$;

revoke all on function public.mark_vehicle_arrived(uuid, date) from public, anon;
revoke all on function public.complete_cashflow(uuid, date) from public, anon;

grant execute on function public.mark_vehicle_arrived(uuid, date) to authenticated;
grant execute on function public.complete_cashflow(uuid, date) to authenticated;
