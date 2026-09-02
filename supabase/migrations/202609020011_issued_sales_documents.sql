-- 販売契約と入金状況に連動する S（請求）・R（領収）の発行履歴。
-- 発行済み内容はスナップショットとして固定し、訂正時は無効化して新しい番号で再発行する。

create type public.issued_document_type as enum ('invoice', 'receipt');
create type public.issued_document_delivery as enum ('electronic', 'paper');
create type public.issued_document_status as enum ('issued', 'voided');

create table private.issued_document_counters (
  document_type public.issued_document_type not null,
  target_month date not null check (target_month = date_trunc('month', target_month)::date),
  last_number integer not null check (last_number > 0),
  primary key (document_type, target_month)
);

create table public.issued_documents (
  id uuid primary key default gen_random_uuid(),
  document_type public.issued_document_type not null,
  document_number text not null unique check (document_number ~ '^[SR]-[0-9]{6}-[0-9]{4}$'),
  contract_id uuid not null references public.contracts(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  cashflow_id uuid references public.cashflows(id) on delete restrict,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 160),
  vehicle_label text not null check (char_length(trim(vehicle_label)) between 1 and 240),
  amount bigint not null check (amount > 0),
  show_tax_breakdown boolean not null default false,
  tax_amount bigint not null default 0 check (tax_amount >= 0 and tax_amount <= amount),
  delivery_method public.issued_document_delivery not null,
  stamp_duty_amount bigint not null default 0 check (stamp_duty_amount >= 0),
  issued_on date not null,
  note text not null default '' check (char_length(note) <= 500),
  status public.issued_document_status not null default 'issued',
  voided_at timestamptz,
  voided_by uuid references public.staff_profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint issued_document_receipt_has_cashflow check (document_type <> 'receipt' or cashflow_id is not null),
  constraint issued_document_stamp_scope check (
    stamp_duty_amount = 0 or (document_type = 'receipt' and delivery_method = 'paper')
  ),
  constraint issued_document_void_consistency check (
    (status = 'issued' and voided_at is null and voided_by is null)
    or (status = 'voided' and voided_at is not null and voided_by is not null)
  )
);

create index issued_documents_issued_on_idx on public.issued_documents(issued_on desc, created_at desc);
create index issued_documents_contract_idx on public.issued_documents(contract_id, created_at desc);

alter table public.issued_documents enable row level security;
grant select on public.issued_documents to authenticated;

create policy issued_documents_business_read
on public.issued_documents for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create trigger issued_documents_audit
after insert or update or delete on public.issued_documents
for each row execute function private.write_audit_log();

create or replace function public.issue_sales_document(
  p_contract_id uuid,
  p_document_type public.issued_document_type,
  p_issued_on date,
  p_delivery_method public.issued_document_delivery,
  p_show_tax_breakdown boolean,
  p_stamp_duty_amount bigint,
  p_note text
)
returns public.issued_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_vehicle public.vehicles;
  v_cashflow public.cashflows;
  v_target_month date;
  v_sequence integer;
  v_prefix text;
  v_document public.issued_documents;
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception 'S・Rを発行する権限がありません。';
  end if;
  if p_issued_on is null then raise exception '発行日を入力してください。'; end if;
  if p_issued_on > current_date then raise exception '発行日に未来の日付は指定できません。'; end if;
  if coalesce(p_stamp_duty_amount, 0) < 0 then raise exception '印紙額は0円以上で入力してください。'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception '備考は500文字以内で入力してください。'; end if;

  select * into v_contract from public.contracts
  where id = p_contract_id and type = 'sale' and status = 'contracted' and deleted_at is null;
  if not found then raise exception '契約済みの販売契約を選択してください。'; end if;

  select * into v_vehicle from public.vehicles where id = v_contract.vehicle_id and deleted_at is null;
  if not found then raise exception '対象車両が見つかりません。'; end if;

  if p_document_type = 'receipt' then
    select * into v_cashflow from public.cashflows
    where vehicle_id = v_contract.vehicle_id
      and direction = 'incoming'
      and kind = 'sale_receipt'
      and status = 'completed'
      and processed_amount = amount
      and deleted_at is null
    order by created_at desc limit 1;
    if not found then raise exception '販売代金の入金完了後にRを発行してください。'; end if;
  end if;

  if p_document_type = 'invoice' or p_delivery_method = 'electronic' then
    p_stamp_duty_amount := 0;
  end if;

  v_target_month := date_trunc('month', p_issued_on)::date;
  insert into private.issued_document_counters(document_type, target_month, last_number)
  values (p_document_type, v_target_month, 1)
  on conflict (document_type, target_month)
  do update set last_number = private.issued_document_counters.last_number + 1
  returning last_number into v_sequence;

  v_prefix := case p_document_type when 'invoice' then 'S' else 'R' end;

  insert into public.issued_documents(
    document_type, document_number, contract_id, vehicle_id, cashflow_id,
    customer_name, vehicle_label, amount, show_tax_breakdown, tax_amount,
    delivery_method, stamp_duty_amount, issued_on, note
  ) values (
    p_document_type,
    v_prefix || '-' || to_char(p_issued_on, 'YYYYMM') || '-' || lpad(v_sequence::text, 4, '0'),
    v_contract.id,
    v_vehicle.id,
    case when p_document_type = 'receipt' then v_cashflow.id else null end,
    v_contract.customer_label,
    v_vehicle.management_number || ' ' || v_vehicle.name,
    v_contract.amount,
    coalesce(p_show_tax_breakdown, false),
    case when coalesce(p_show_tax_breakdown, false) then floor(v_contract.amount * 10.0 / 110.0)::bigint else 0 end,
    p_delivery_method,
    coalesce(p_stamp_duty_amount, 0),
    p_issued_on,
    trim(coalesce(p_note, ''))
  ) returning * into v_document;

  return v_document;
end;
$$;

create or replace function public.void_issued_document(p_document_id uuid)
returns public.issued_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.issued_documents;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception 'S・Rを無効化できるのは事業主だけです。';
  end if;
  update public.issued_documents
  set status = 'voided', voided_at = now(), voided_by = auth.uid()
  where id = p_document_id and status = 'issued'
  returning * into v_document;
  if not found then raise exception '対象の発行履歴が見つからないか、すでに無効です。'; end if;
  return v_document;
end;
$$;

revoke all on function public.issue_sales_document(uuid, public.issued_document_type, date, public.issued_document_delivery, boolean, bigint, text) from public, anon;
grant execute on function public.issue_sales_document(uuid, public.issued_document_type, date, public.issued_document_delivery, boolean, bigint, text) to authenticated;
revoke all on function public.void_issued_document(uuid) from public, anon;
grant execute on function public.void_issued_document(uuid) to authenticated;
