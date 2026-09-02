-- 誤って入庫済みにした車両を入庫予定へ戻す際は、誤った入庫日を消せるようにする。

create or replace function private.guard_vehicle_arrival_with_receipt_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.documents_complete := private.vehicle_receipt_checklist_complete(old.id);

  if old.status = 'planned_arrival'
     and (
       new.status is distinct from old.status
       or (new.arrived_at is not null and new.arrived_at is distinct from old.arrived_at)
     )
     and not new.documents_complete then
    raise exception '受取確認をすべて「受取済み」または「不要」にしてから入庫を確定してください。';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_vehicle_arrival_with_receipt_checklist() from public, anon, authenticated;
