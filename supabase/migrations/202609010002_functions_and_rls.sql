-- 採番、業務ルール、監査ログ、RLS

create or replace function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.staff_profiles
  where id = (select auth.uid())
    and is_active = true
$$;

create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles
    where id = (select auth.uid())
      and is_active = true
  )
$$;

create or replace function private.has_role(allowed_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_staff_role() = any(allowed_roles), false)
$$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on function private.current_staff_role() from public;
revoke all on function private.is_active_staff() from public;
revoke all on function private.has_role(public.staff_role[]) from public;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.has_role(public.staff_role[]) to authenticated;

create or replace function private.next_vehicle_management_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_year smallint := extract(year from timezone('Asia/Tokyo', now()))::smallint;
  v_next integer;
begin
  insert into private.vehicle_number_counters(calendar_year, last_number)
  values (v_year, 1)
  on conflict (calendar_year)
  do update set last_number = private.vehicle_number_counters.last_number + 1
  returning last_number into v_next;

  return right(v_year::text, 2) || '-' || lpad(v_next::text, 4, '0');
end;
$$;
revoke all on function private.next_vehicle_management_number() from public, anon, authenticated;

create or replace function private.assign_vehicle_management_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.management_number := private.next_vehicle_management_number();
  return new;
end;
$$;

create trigger vehicles_assign_management_number
before insert on public.vehicles
for each row execute function private.assign_vehicle_management_number();

create or replace function private.protect_vehicle_management_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.management_number is distinct from old.management_number then
    raise exception '管理番号は変更できません。';
  end if;
  return new;
end;
$$;

create trigger vehicles_protect_management_number
before update on public.vehicles
for each row execute function private.protect_vehicle_management_number();

create or replace function private.set_updated_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger staff_profiles_set_updated_at before update on public.staff_profiles
for each row execute function private.set_updated_columns();
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function private.set_updated_columns();
create trigger vehicle_documents_set_updated_at before update on public.vehicle_documents
for each row execute function private.set_updated_columns();
create trigger contracts_set_updated_at before update on public.contracts
for each row execute function private.set_updated_columns();
create trigger expenses_set_updated_at before update on public.expenses
for each row execute function private.set_updated_columns();
create trigger cashflows_set_updated_at before update on public.cashflows
for each row execute function private.set_updated_columns();
create trigger approvals_set_updated_at before update on public.approvals
for each row execute function private.set_updated_columns();
create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function private.set_updated_columns();

create or replace function private.protect_last_active_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and old.is_active = true
     and (new.role <> 'owner' or new.is_active = false)
     and not exists (
       select 1
       from public.staff_profiles
       where id <> old.id
         and role = 'owner'
         and is_active = true
     ) then
    raise exception '有効な事業主アカウントを最低1人残してください。';
  end if;
  return new;
end;
$$;

create trigger staff_profiles_protect_last_owner
before update on public.staff_profiles
for each row execute function private.protect_last_active_owner();

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
  end if;
  return new;
end;
$$;

create trigger cashflows_enforce_purchase_payment
before insert or update on public.cashflows
for each row execute function private.enforce_purchase_payment_after_arrival();

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record_id uuid;
begin
  if tg_op = 'DELETE' then
    v_record_id := old.id;
    insert into public.audit_logs(actor_id, table_name, record_id, action, old_data, new_data)
    values (auth.uid(), tg_table_name, v_record_id, tg_op, to_jsonb(old), null);
    return old;
  end if;

  v_record_id := new.id;
  insert into public.audit_logs(actor_id, table_name, record_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    v_record_id,
    tg_op,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;
revoke all on function private.write_audit_log() from public, anon, authenticated;

create trigger vehicles_audit after insert or update or delete on public.vehicles
for each row execute function private.write_audit_log();
create trigger vehicle_documents_audit after insert or update or delete on public.vehicle_documents
for each row execute function private.write_audit_log();
create trigger contracts_audit after insert or update or delete on public.contracts
for each row execute function private.write_audit_log();
create trigger expenses_audit after insert or update or delete on public.expenses
for each row execute function private.write_audit_log();
create trigger cashflows_audit after insert or update or delete on public.cashflows
for each row execute function private.write_audit_log();
create trigger approvals_audit after insert or update or delete on public.approvals
for each row execute function private.write_audit_log();

alter table public.staff_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_documents enable row level security;
alter table public.contracts enable row level security;
alter table public.expenses enable row level security;
alter table public.cashflows enable row level security;
alter table public.approvals enable row level security;
alter table public.attachments enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant select, insert, update on public.vehicles to authenticated;
grant select, insert, update on public.vehicle_documents to authenticated;
grant select, insert, update on public.contracts to authenticated;
grant select, insert, update on public.expenses to authenticated;
grant select, insert, update on public.cashflows to authenticated;
grant select, insert, update on public.approvals to authenticated;
grant select, insert, delete on public.attachments to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select on public.staff_profiles, public.audit_logs to authenticated;
grant update (display_name, role, is_active, deactivated_at) on public.staff_profiles to authenticated;

create policy staff_profiles_read_self
on public.staff_profiles for select to authenticated
using (id = (select auth.uid()));
create policy staff_profiles_owner_read
on public.staff_profiles for select to authenticated
using (private.has_role(array['owner']::public.staff_role[]));
create policy staff_profiles_owner_update
on public.staff_profiles for update to authenticated
using (private.has_role(array['owner']::public.staff_role[]))
with check (private.has_role(array['owner']::public.staff_role[]));

create policy vehicles_operations_read
on public.vehicles for select to authenticated
using (
  private.has_role(array['owner', 'regular']::public.staff_role[])
  and (deleted_at is null or private.current_staff_role() = 'owner')
);
create policy vehicles_accounting_read
on public.vehicles for select to authenticated
using (private.has_role(array['accounting']::public.staff_role[]) and deleted_at is null);
create policy vehicles_operations_insert
on public.vehicles for insert to authenticated
with check (
  private.has_role(array['owner', 'regular']::public.staff_role[])
  and created_by = (select auth.uid())
  and deleted_at is null
);
create policy vehicles_operations_update
on public.vehicles for update to authenticated
using (private.has_role(array['owner', 'regular']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular']::public.staff_role[]));

create policy vehicle_documents_operations_read
on public.vehicle_documents for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));
create policy vehicle_documents_operations_insert
on public.vehicle_documents for insert to authenticated
with check (private.has_role(array['owner', 'regular']::public.staff_role[]) and created_by = (select auth.uid()));
create policy vehicle_documents_operations_update
on public.vehicle_documents for update to authenticated
using (private.has_role(array['owner', 'regular']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular']::public.staff_role[]));

create policy contracts_business_read
on public.contracts for select to authenticated
using (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and (deleted_at is null or private.current_staff_role() = 'owner')
);
create policy contracts_operations_insert
on public.contracts for insert to authenticated
with check (private.has_role(array['owner', 'regular']::public.staff_role[]) and created_by = (select auth.uid()));
create policy contracts_operations_update
on public.contracts for update to authenticated
using (private.has_role(array['owner', 'regular']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular']::public.staff_role[]));

create policy expenses_business_read
on public.expenses for select to authenticated
using (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and (deleted_at is null or private.current_staff_role() = 'owner')
);
create policy expenses_business_insert
on public.expenses for insert to authenticated
with check (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and created_by = (select auth.uid())
);
create policy expenses_business_update
on public.expenses for update to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create policy cashflows_business_read
on public.cashflows for select to authenticated
using (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and (deleted_at is null or private.current_staff_role() = 'owner')
);
create policy cashflows_business_insert
on public.cashflows for insert to authenticated
with check (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and created_by = (select auth.uid())
);
create policy cashflows_business_update
on public.cashflows for update to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create policy approvals_operations_read
on public.approvals for select to authenticated
using (private.has_role(array['owner', 'regular']::public.staff_role[]));
create policy approvals_operations_insert
on public.approvals for insert to authenticated
with check (
  private.has_role(array['owner', 'regular']::public.staff_role[])
  and requested_by = (select auth.uid())
);
create policy approvals_owner_update
on public.approvals for update to authenticated
using (private.has_role(array['owner']::public.staff_role[]))
with check (private.has_role(array['owner']::public.staff_role[]));

create policy attachments_business_read
on public.attachments for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));
create policy attachments_operations_insert
on public.attachments for insert to authenticated
with check (private.has_role(array['owner', 'regular']::public.staff_role[]) and created_by = (select auth.uid()));
create policy attachments_operations_delete
on public.attachments for delete to authenticated
using (private.has_role(array['owner']::public.staff_role[]));

create policy app_settings_owner_all
on public.app_settings for all to authenticated
using (private.has_role(array['owner']::public.staff_role[]))
with check (private.has_role(array['owner']::public.staff_role[]));

create policy audit_logs_owner_read
on public.audit_logs for select to authenticated
using (private.has_role(array['owner']::public.staff_role[]));

-- スポットスタッフには金額・利益・顧客名を返さず、専用画面からこの関数だけを使用する。
create or replace function public.spot_vehicle_overview()
returns table (
  id uuid,
  management_number text,
  name text,
  status public.vehicle_status,
  storage_location text,
  planned_arrival_date date,
  arrived_at date,
  documents_complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id,
    v.management_number,
    v.name,
    v.status,
    v.storage_location,
    v.planned_arrival_date,
    v.arrived_at,
    v.documents_complete
  from public.vehicles v
  where v.deleted_at is null
    and private.current_staff_role() = 'spot'
$$;
revoke all on function public.spot_vehicle_overview() from public, anon;
grant execute on function public.spot_vehicle_overview() to authenticated;
