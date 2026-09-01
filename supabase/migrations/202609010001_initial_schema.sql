-- オーダーオート共通管理システム 初期スキーマ
-- 金額はすべて円・整数で保存する。画面上の税込/税抜表示は tax_treatment と tax_rate から行う。

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create type public.staff_role as enum ('owner', 'accounting', 'regular', 'spot');
create type public.vehicle_status as enum (
  'planned_arrival',
  'arrived',
  'for_sale',
  'reserved',
  'delivered',
  'scrapped'
);
create type public.acquisition_source as enum ('customer', 'auction', 'dealer', 'insurance');
create type public.expense_status as enum ('planned', 'confirmed');
create type public.payment_status as enum ('unpaid', 'paid');
create type public.cashflow_direction as enum ('incoming', 'outgoing');
create type public.cashflow_status as enum ('unprocessed', 'partial', 'completed');
create type public.payment_method as enum ('cash', 'bank_transfer', 'loan_company', 'card', 'other');
create type public.cashflow_kind as enum (
  'purchase_payment',
  'sale_receipt',
  'expense_payment',
  'refund',
  'other'
);
create type public.contract_type as enum ('purchase', 'sale');
create type public.contract_status as enum ('draft', 'awaiting_signature', 'contracted', 'cancelled');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.tax_treatment as enum (
  'unconfirmed',
  'taxable_10',
  'taxable_8',
  'non_taxable',
  'exempt',
  'out_of_scope'
);

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  role public.staff_role not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_deactivation_consistency check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  )
);

comment on table public.staff_profiles is 'Supabase Auth利用者と社内権限。公開登録は行わず事業主が作成する。';
comment on column public.staff_profiles.role is 'owner=事業主、accounting=奥様/税理士、regular=通常スタッフ、spot=スポットスタッフ';

create table private.vehicle_number_counters (
  calendar_year smallint primary key check (calendar_year between 2000 and 9999),
  last_number integer not null check (last_number > 0)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  management_number text not null unique,
  name text not null check (char_length(trim(name)) between 1 and 160),
  chassis_number text,
  status public.vehicle_status not null default 'planned_arrival',
  acquisition_source public.acquisition_source not null,
  purchase_price bigint not null default 0 check (purchase_price >= 0),
  asking_price bigint not null default 0 check (asking_price >= 0),
  sale_price bigint check (sale_price is null or sale_price >= 0),
  purchase_tax_treatment public.tax_treatment not null default 'unconfirmed',
  sale_tax_treatment public.tax_treatment not null default 'unconfirmed',
  tax_rate smallint check (tax_rate is null or tax_rate in (0, 8, 10)),
  storage_location text not null default '自宅',
  planned_arrival_date date not null,
  arrived_at date,
  delivered_at date,
  documents_complete boolean not null default false,
  previous_vehicle_id uuid references public.vehicles(id) on delete set null,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chassis_number_not_blank check (chassis_number is null or char_length(trim(chassis_number)) > 0),
  constraint vehicle_arrival_dates check (arrived_at is null or arrived_at >= planned_arrival_date - 365),
  constraint vehicle_delivery_after_arrival check (delivered_at is null or arrived_at is null or delivered_at >= arrived_at),
  constraint vehicle_soft_delete_consistency check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);

-- 納車済み・廃車済みの履歴を残したまま、同じ車を再買取できる。
create unique index vehicles_active_chassis_number_key
  on public.vehicles (upper(chassis_number))
  where chassis_number is not null
    and deleted_at is null
    and status not in ('delivered', 'scrapped');
create index vehicles_status_idx on public.vehicles(status) where deleted_at is null;
create index vehicles_created_at_idx on public.vehicles(created_at desc) where deleted_at is null;

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  document_type text not null check (document_type in (
    'vehicle_inspection_certificate',
    'seal_registration_certificate',
    'residence_certificate',
    'application_request_form',
    'compulsory_automobile_liability_insurance',
    'other'
  )),
  is_required boolean not null default true,
  is_received boolean not null default false,
  received_at date,
  note text,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, document_type),
  constraint received_document_date check (not is_received or received_at is not null)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  type public.contract_type not null,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  customer_label text not null check (char_length(trim(customer_label)) between 1 and 160),
  amount bigint not null default 0 check (amount >= 0),
  tax_treatment public.tax_treatment not null default 'unconfirmed',
  tax_rate smallint check (tax_rate is null or tax_rate in (0, 8, 10)),
  status public.contract_status not null default 'draft',
  contracted_on date not null,
  supersedes_contract_id uuid references public.contracts(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_soft_delete_consistency check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);
create index contracts_vehicle_idx on public.contracts(vehicle_id) where deleted_at is null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  category text not null check (char_length(trim(category)) between 1 and 80),
  description text not null check (char_length(trim(description)) between 1 and 500),
  amount bigint not null check (amount > 0),
  tax_treatment public.tax_treatment not null default 'unconfirmed',
  tax_rate smallint check (tax_rate is null or tax_rate in (0, 8, 10)),
  expense_status public.expense_status not null,
  payment_status public.payment_status not null,
  incurred_on date not null,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_expense_unpaid check (expense_status <> 'planned' or payment_status = 'unpaid'),
  constraint expense_soft_delete_consistency check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);
create index expenses_vehicle_idx on public.expenses(vehicle_id) where deleted_at is null;
create index expenses_incurred_on_idx on public.expenses(incurred_on desc) where deleted_at is null;

create table public.cashflows (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  direction public.cashflow_direction not null,
  kind public.cashflow_kind not null default 'other',
  description text not null check (char_length(trim(description)) between 1 and 500),
  amount bigint not null check (amount > 0),
  processed_amount bigint not null default 0 check (processed_amount >= 0),
  status public.cashflow_status not null default 'unprocessed',
  method public.payment_method not null,
  scheduled_on date not null,
  processed_on date,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashflow_processed_within_total check (processed_amount <= amount),
  constraint cashflow_status_matches_amount check (
    (processed_amount = 0 and status = 'unprocessed')
    or (processed_amount > 0 and processed_amount < amount and status = 'partial')
    or (processed_amount = amount and status = 'completed')
  ),
  constraint purchase_payment_has_vehicle check (kind <> 'purchase_payment' or vehicle_id is not null),
  constraint cashflow_soft_delete_consistency check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);
create index cashflows_vehicle_idx on public.cashflows(vehicle_id) where deleted_at is null;
create index cashflows_scheduled_on_idx on public.cashflows(scheduled_on desc) where deleted_at is null;

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 200),
  requested_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  decided_by uuid references public.staff_profiles(id) on delete restrict,
  status public.approval_status not null default 'pending',
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_decision_consistency check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete restrict,
  expense_id uuid references public.expenses(id) on delete restrict,
  category text not null check (char_length(trim(category)) between 1 and 80),
  original_file_name text not null check (char_length(trim(original_file_name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint attachment_has_parent check (num_nonnulls(vehicle_id, contract_id, expense_id) = 1)
);

create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,79}$'),
  value jsonb not null,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.staff_profiles(id) on delete restrict,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs(table_name, record_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_id, occurred_at desc);
