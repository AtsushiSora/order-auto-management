-- 入庫後のオークション売却・廃車処分を、在庫・入出金・経費・古物台帳へ一括反映する。
create or replace function public.complete_vehicle_disposition(
  p_vehicle_id uuid,
  p_disposition text,
  p_counterparty text,
  p_proceeds_amount bigint,
  p_fee_amount bigint,
  p_completed_on date,
  p_income_method public.payment_method,
  p_fee_payment_method public.payment_method
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
  v_expense_id uuid;
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '振り分け後の処理を登録する権限がありません。';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then raise exception '対象車両が見つかりません。'; end if;
  if v_vehicle.arrived_at is null or v_vehicle.status = 'planned_arrival' then
    raise exception '入庫を確定してから処理してください。';
  end if;
  if v_vehicle.status not in ('arrived', 'for_sale') then
    raise exception '入庫済みまたは販売中の車両だけ処理できます。';
  end if;
  if p_disposition not in ('auction', 'scrap') or v_vehicle.disposition <> p_disposition then
    raise exception '車両の振り分けと処理内容が一致していません。';
  end if;
  if char_length(trim(coalesce(p_counterparty, ''))) < 1 then
    raise exception '取引先・業者名を入力してください。';
  end if;
  if p_completed_on is null or p_completed_on > current_date or p_completed_on < v_vehicle.arrived_at then
    raise exception '処理日は入庫日から今日までの日付で入力してください。';
  end if;
  if p_proceeds_amount < 0 or p_fee_amount < 0 then
    raise exception '金額は0円以上で入力してください。';
  end if;
  if p_disposition = 'auction' and p_proceeds_amount = 0 then
    raise exception 'オークションの売却金額は1円以上で入力してください。';
  end if;

  update public.vehicles
  set disposition = p_disposition,
      status = case when p_disposition = 'auction' then 'delivered'::public.vehicle_status else 'scrapped'::public.vehicle_status end,
      sale_price = p_proceeds_amount,
      delivered_at = p_completed_on,
      sales_site_published = false,
      updated_by = auth.uid()
  where id = p_vehicle_id;

  if p_proceeds_amount > 0 then
    insert into public.cashflows (
      vehicle_id, direction, kind, description, amount, processed_amount,
      status, method, scheduled_on
    ) values (
      p_vehicle_id,
      'incoming',
      case when p_disposition = 'auction' then 'sale_receipt'::public.cashflow_kind else 'other'::public.cashflow_kind end,
      case when p_disposition = 'auction' then 'オークション売却代金 ' else '廃車・還付等入金 ' end || trim(p_counterparty),
      p_proceeds_amount, 0, 'unprocessed', p_income_method, p_completed_on
    );
  end if;

  if p_fee_amount > 0 then
    insert into public.expenses (
      vehicle_id, category, description, amount, expense_status,
      payment_status, payment_method, incurred_on
    ) values (
      p_vehicle_id,
      case when p_disposition = 'auction' then '販売手数料' else '外注費' end,
      trim(p_counterparty) || case when p_disposition = 'auction' then ' オークション手数料' else ' 廃車処分費' end,
      p_fee_amount, 'confirmed', 'unpaid', p_fee_payment_method, p_completed_on
    ) returning id into v_expense_id;

    insert into public.cashflows (
      vehicle_id, source_expense_id, direction, kind, description, amount,
      processed_amount, status, method, scheduled_on
    ) values (
      p_vehicle_id, v_expense_id, 'outgoing', 'expense_payment',
      case when p_disposition = 'auction' then 'オークション手数料 ' else '廃車処分費 ' end || trim(p_counterparty),
      p_fee_amount, 0, 'unprocessed', p_fee_payment_method, p_completed_on
    );
  end if;

  insert into public.antique_ledger_details (
    vehicle_id, disposal_on_override, disposal_type_override, buyer_name_override
  ) values (
    p_vehicle_id,
    p_completed_on,
    case when p_disposition = 'auction' then 'sale' else 'scrap' end,
    trim(p_counterparty)
  )
  on conflict (vehicle_id) do update
  set disposal_on_override = excluded.disposal_on_override,
      disposal_type_override = excluded.disposal_type_override,
      buyer_name_override = excluded.buyer_name_override,
      updated_by = auth.uid();
end;
$$;

revoke all on function public.complete_vehicle_disposition(
  uuid, text, text, bigint, bigint, date, public.payment_method, public.payment_method
) from public, anon;

grant execute on function public.complete_vehicle_disposition(
  uuid, text, text, bigint, bigint, date, public.payment_method, public.payment_method
) to authenticated;
