-- 車両本体と必要書類の受取確認を完了するまで、入庫確定と買取代金処理を禁止する。

alter table public.vehicle_documents
  drop constraint vehicle_documents_document_type_check;

alter table public.vehicle_documents
  add constraint vehicle_documents_document_type_check check (document_type in (
    'vehicle_body',
    'keys',
    'vehicle_inspection_certificate',
    'transfer_certificate',
    'seal_registration_certificate',
    'residence_certificate',
    'application_request_form',
    'compulsory_automobile_liability_insurance',
    'other'
  ));

create or replace function private.vehicle_receipt_checklist_complete(p_vehicle_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    count(distinct document_type) = 9
    and bool_and(
      case
        when document_type = 'keys' and is_received
          then coalesce(note, '') ~ '^[1-9][0-9]*$'
        else is_received or not is_required
      end
    )
  from public.vehicle_documents
  where vehicle_id = p_vehicle_id
    and document_type in (
      'vehicle_body',
      'keys',
      'vehicle_inspection_certificate',
      'transfer_certificate',
      'seal_registration_certificate',
      'residence_certificate',
      'application_request_form',
      'compulsory_automobile_liability_insurance',
      'other'
    );
$$;

create or replace function private.sync_vehicle_receipt_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle_id uuid := case when tg_op = 'DELETE' then old.vehicle_id else new.vehicle_id end;
begin
  update public.vehicles
  set documents_complete = private.vehicle_receipt_checklist_complete(v_vehicle_id)
  where id = v_vehicle_id;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists vehicle_documents_sync_receipt_checklist on public.vehicle_documents;
create trigger vehicle_documents_sync_receipt_checklist
after insert or update or delete on public.vehicle_documents
for each row execute function private.sync_vehicle_receipt_checklist();

create or replace function private.guard_vehicle_arrival_with_receipt_checklist()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.documents_complete := private.vehicle_receipt_checklist_complete(old.id);

  if old.status = 'planned_arrival'
     and (new.status is distinct from old.status or new.arrived_at is distinct from old.arrived_at)
     and not new.documents_complete then
    raise exception '受取確認をすべて「受取済み」または「不要」にしてから入庫を確定してください。';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_guard_arrival_receipt_checklist on public.vehicles;
create trigger vehicles_guard_arrival_receipt_checklist
before update on public.vehicles
for each row execute function private.guard_vehicle_arrival_with_receipt_checklist();

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
  if not private.vehicle_receipt_checklist_complete(p_vehicle_id) then
    raise exception '受取確認をすべて「受取済み」または「不要」にしてから入庫を確定してください。';
  end if;

  update public.vehicles
  set
    status = 'arrived',
    arrived_at = p_arrived_on,
    documents_complete = true
  where id = p_vehicle_id;
end;
$$;

create or replace function private.enforce_purchase_payment_after_arrival()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.vehicle_status;
begin
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

update public.vehicles vehicle
set documents_complete = private.vehicle_receipt_checklist_complete(vehicle.id)
where deleted_at is null;

revoke all on function private.vehicle_receipt_checklist_complete(uuid) from public, anon, authenticated;
revoke all on function private.sync_vehicle_receipt_checklist() from public, anon, authenticated;
revoke all on function private.guard_vehicle_arrival_with_receipt_checklist() from public, anon, authenticated;

revoke all on function public.mark_vehicle_arrived(uuid, date) from public, anon;
grant execute on function public.mark_vehicle_arrived(uuid, date) to authenticated;
