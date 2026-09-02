-- 古物台帳は車両・契約の既存情報を自動参照し、法定記録で不足する情報だけを保存する。

create table public.antique_ledger_details (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null unique references public.vehicles(id) on delete restrict,
  intake_type text not null default 'purchase'
    check (intake_type in ('purchase', 'consignment')),
  received_on_override date,
  registration_number text not null default '' check (char_length(registration_number) <= 80),
  registered_owner_name text not null default '' check (char_length(registered_owner_name) <= 160),
  item_features text not null default '' check (char_length(item_features) <= 1000),
  counterparty_type text not null default 'individual'
    check (counterparty_type in ('individual', 'business', 'auction')),
  seller_name_override text not null default '' check (char_length(seller_name_override) <= 160),
  seller_address text not null default '' check (char_length(seller_address) <= 500),
  seller_occupation text not null default '' check (char_length(seller_occupation) <= 160),
  seller_age smallint check (seller_age is null or seller_age between 0 and 120),
  identity_verification_method text check (identity_verification_method is null or identity_verification_method in (
    'drivers_license',
    'my_number_card',
    'residence_card',
    'seal_certificate',
    'antique_dealer_license',
    'auction_record',
    'other'
  )),
  identity_verification_note text not null default '' check (char_length(identity_verification_note) <= 1000),
  disposal_on_override date,
  disposal_type_override text check (disposal_type_override is null or disposal_type_override in (
    'sale', 'consigned_delivery', 'return', 'scrap'
  )),
  buyer_name_override text not null default '' check (char_length(buyer_name_override) <= 160),
  note text not null default '' check (char_length(note) <= 2000),
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint antique_ledger_disposal_after_receipt check (
    received_on_override is null
    or disposal_on_override is null
    or disposal_on_override >= received_on_override
  )
);

comment on table public.antique_ledger_details is
  '車両・契約から自動生成する古物台帳に対し、本人確認や車検証上の特徴など不足項目だけを補足する。';
comment on column public.antique_ledger_details.received_on_override is
  '通常はvehicles.arrived_atを使用し、訂正が必要な場合だけ指定する。';
comment on column public.antique_ledger_details.disposal_on_override is
  '通常はvehicles.delivered_atを使用し、廃車・返還・訂正時だけ指定する。';

create index antique_ledger_details_updated_at_idx
  on public.antique_ledger_details(updated_at desc);

create trigger antique_ledger_details_set_updated_at
before update on public.antique_ledger_details
for each row execute function private.set_updated_columns();

create trigger antique_ledger_details_audit
after insert or update or delete on public.antique_ledger_details
for each row execute function private.write_audit_log();

alter table public.antique_ledger_details enable row level security;

revoke all on public.antique_ledger_details from public, anon, authenticated;
grant select, insert, update on public.antique_ledger_details to authenticated;

create policy antique_ledger_details_business_read
on public.antique_ledger_details for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create policy antique_ledger_details_operations_insert
on public.antique_ledger_details for insert to authenticated
with check (
  private.has_role(array['owner', 'regular']::public.staff_role[])
  and created_by = (select auth.uid())
);

create policy antique_ledger_details_operations_update
on public.antique_ledger_details for update to authenticated
using (private.has_role(array['owner', 'regular']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular']::public.staff_role[]));

