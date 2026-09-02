-- バックアップ復元中は、保存済みの過去データをそのまま戻せるようにする。
-- 通常操作では、入庫・受取確認前の買取代金支払い禁止を引き続き適用する。

create or replace function private.enforce_purchase_payment_after_arrival()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.vehicle_status;
begin
  if coalesce(current_setting('order_auto.restore_mode', true), '') = 'on' then
    return new;
  end if;

  if new.kind = 'purchase_payment'
     and new.direction = 'outgoing'
     and new.processed_amount > 0 then
    select status into v_status
    from public.vehicles
    where id = new.vehicle_id
      and deleted_at is null;

    if v_status is null then
      raise exception '対象車両が見つかりません。';
    end if;
    if v_status = 'planned_arrival' then
      raise exception '買取代金は車両の入庫後に支払ってください。';
    end if;
    if not private.vehicle_receipt_checklist_complete(new.vehicle_id) then
      raise exception '車両・書類の受取確認完了後に買取代金を支払ってください。';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_purchase_payment_after_arrival() from public, anon, authenticated;
