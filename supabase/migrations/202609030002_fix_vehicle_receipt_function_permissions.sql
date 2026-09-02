-- 内部判定関数は非公開のまま、限定されたRPCとトリガーだけが所有者権限で呼び出す。

alter function private.guard_vehicle_arrival_with_receipt_checklist() security definer;
alter function private.enforce_purchase_payment_after_arrival() security definer;
alter function public.mark_vehicle_arrived(uuid, date) security definer;

revoke all on function private.vehicle_receipt_checklist_complete(uuid) from public, anon, authenticated;
