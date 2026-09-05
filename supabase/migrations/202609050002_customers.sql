-- 顧客台帳、連絡履歴、契約との紐付け。

create type public.customer_entity_type as enum ('individual', 'business');
create type public.customer_category as enum ('general', 'auction', 'scrap_dealer', 'insurance', 'contractor', 'other');
create type public.customer_contact_channel as enum ('phone', 'line', 'email', 'in_person', 'other');

create sequence private.customer_number_seq start with 1;

create or replace function private.next_customer_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'C-' || lpad(nextval('private.customer_number_seq')::text, 4, '0')
$$;
revoke all on function private.next_customer_number() from public, anon, authenticated;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text not null unique default private.next_customer_number(),
  entity_type public.customer_entity_type not null,
  category public.customer_category not null default 'general',
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  kana text not null default '',
  birth_date date,
  contact_person text not null default '',
  postal_code text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  invoice_registration_number text not null default '',
  important_note text not null default '',
  memo text not null default '',
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_birth_date_type check (entity_type = 'individual' or birth_date is null)
);

create index customers_name_idx on public.customers (lower(display_name));
create index customers_phone_idx on public.customers (regexp_replace(phone, '[^0-9]', '', 'g')) where phone <> '';
create index customers_email_idx on public.customers (lower(email)) where email <> '';

alter table public.contracts
  add column customer_id uuid references public.customers(id) on delete restrict;
create index contracts_customer_idx on public.contracts(customer_id) where deleted_at is null;

create table public.customer_contact_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  contacted_at timestamptz not null,
  channel public.customer_contact_channel not null,
  staff_id uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index customer_contact_logs_customer_idx on public.customer_contact_logs(customer_id, contacted_at desc);

create trigger customers_set_updated_at before update on public.customers
for each row execute function private.set_updated_columns();
create trigger customers_audit after insert or update or delete on public.customers
for each row execute function private.write_audit_log();
create trigger customer_contact_logs_audit after insert or update or delete on public.customer_contact_logs
for each row execute function private.write_audit_log();

-- 契約サイトから顧客が指定されなかった場合も、契約完了時に最低限の顧客台帳を自動作成する。
create or replace function private.link_customer_after_contract_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_actor uuid;
begin
  if new.status <> 'contracted' or new.customer_id is not null then
    return new;
  end if;
  if nullif(btrim(new.customer_label), '') is null or new.customer_label = '契約サイトで入力' then
    return new;
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.is_active = true and lower(btrim(c.display_name)) = lower(btrim(new.customer_label))
  order by c.updated_at desc
  limit 1;

  if v_customer_id is null then
    v_actor := coalesce(auth.uid(), new.updated_by, new.created_by);
    insert into public.customers(entity_type, category, display_name, phone, email, created_by, updated_by)
    values ('individual', 'general', left(btrim(new.customer_label), 160), '', '', v_actor, v_actor)
    returning id into v_customer_id;
  end if;
  new.customer_id := v_customer_id;
  return new;
end;
$$;
revoke all on function private.link_customer_after_contract_completion() from public, anon, authenticated;

create trigger contracts_link_customer
before insert or update of status, customer_label, customer_id on public.contracts
for each row execute function private.link_customer_after_contract_completion();

alter table public.customers enable row level security;
alter table public.customer_contact_logs enable row level security;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customer_contact_logs to authenticated;

create policy customers_staff_read
on public.customers for select to authenticated
using (
  private.has_role(array['owner', 'accounting', 'regular']::public.staff_role[])
  or (
    private.current_staff_role() = 'spot'
    and exists (
      select 1
      from public.contracts c
      join public.spot_assignments a on a.contract_id = c.id
      where c.customer_id = customers.id
        and a.staff_id = (select auth.uid())
        and a.status <> 'cancelled'
    )
  )
);

create policy customers_operations_insert
on public.customers for insert to authenticated
with check (private.has_role(array['owner', 'regular']::public.staff_role[]) and created_by = (select auth.uid()));
create policy customers_operations_update
on public.customers for update to authenticated
using (private.has_role(array['owner', 'regular']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular']::public.staff_role[]));
create policy customers_owner_delete
on public.customers for delete to authenticated
using (private.current_staff_role() = 'owner');

create policy customer_contact_logs_read
on public.customer_contact_logs for select to authenticated
using (exists (select 1 from public.customers c where c.id = customer_contact_logs.customer_id));
create policy customer_contact_logs_insert
on public.customer_contact_logs for insert to authenticated
with check (
  staff_id = (select auth.uid())
  and exists (select 1 from public.customers c where c.id = customer_contact_logs.customer_id)
);
create policy customer_contact_logs_owner_delete
on public.customer_contact_logs for delete to authenticated
using (private.current_staff_role() = 'owner');
