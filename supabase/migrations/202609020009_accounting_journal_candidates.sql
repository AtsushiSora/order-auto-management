-- 元取引から作る仕訳候補の確認結果と、月次CSVの出力履歴を保存する。

create table public.journal_candidate_reviews (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (source_key ~ '^[a-z]+:[0-9a-z-]+:[a-z]+$'),
  candidate_date date not null,
  description text not null check (char_length(trim(description)) between 1 and 500),
  debit_account text not null check (char_length(trim(debit_account)) between 1 and 80),
  credit_account text not null check (char_length(trim(credit_account)) between 1 and 80),
  amount bigint not null check (amount > 0),
  tax_treatment public.tax_treatment not null default 'unconfirmed',
  review_status text not null default 'pending' check (review_status in ('pending', 'confirmed')),
  source_fingerprint text not null check (char_length(source_fingerprint) between 1 and 1000),
  note text not null default '' check (char_length(note) <= 1000),
  reviewed_by uuid references public.staff_profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_review_confirmation_consistency check (
    (review_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (review_status = 'confirmed' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint journal_confirmed_tax_checked check (
    review_status <> 'confirmed' or tax_treatment <> 'unconfirmed'
  )
);

create table public.journal_exports (
  id uuid primary key default gen_random_uuid(),
  target_month date not null check (extract(day from target_month) = 1),
  export_kind text not null default 'general_csv' check (export_kind = 'general_csv'),
  row_count integer not null check (row_count > 0),
  created_by uuid not null default auth.uid() references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index journal_candidate_reviews_date_idx on public.journal_candidate_reviews(candidate_date desc);
create index journal_exports_month_idx on public.journal_exports(target_month desc, created_at desc);

create trigger journal_candidate_reviews_set_updated_at
before update on public.journal_candidate_reviews
for each row execute function private.set_updated_columns();

create trigger journal_candidate_reviews_audit
after insert or update or delete on public.journal_candidate_reviews
for each row execute function private.write_audit_log();

create trigger journal_exports_audit
after insert or update or delete on public.journal_exports
for each row execute function private.write_audit_log();

alter table public.journal_candidate_reviews enable row level security;
alter table public.journal_exports enable row level security;

revoke all on public.journal_candidate_reviews, public.journal_exports from public, anon, authenticated;
grant select, insert, update on public.journal_candidate_reviews to authenticated;
grant select, insert on public.journal_exports to authenticated;

create policy journal_candidate_reviews_business_read
on public.journal_candidate_reviews for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create policy journal_candidate_reviews_accounting_insert
on public.journal_candidate_reviews for insert to authenticated
with check (
  private.has_role(array['owner', 'accounting']::public.staff_role[])
  and created_by = (select auth.uid())
  and (reviewed_by is null or reviewed_by = (select auth.uid()))
);

create policy journal_candidate_reviews_accounting_update
on public.journal_candidate_reviews for update to authenticated
using (private.has_role(array['owner', 'accounting']::public.staff_role[]))
with check (
  private.has_role(array['owner', 'accounting']::public.staff_role[])
  and (reviewed_by is null or reviewed_by = (select auth.uid()))
);

create policy journal_exports_business_read
on public.journal_exports for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create policy journal_exports_accounting_insert
on public.journal_exports for insert to authenticated
with check (
  private.has_role(array['owner', 'accounting']::public.staff_role[])
  and created_by = (select auth.uid())
);

create or replace function public.save_journal_candidate_review(
  p_source_key text,
  p_candidate_date date,
  p_description text,
  p_debit_account text,
  p_credit_account text,
  p_amount bigint,
  p_tax_treatment public.tax_treatment,
  p_review_status text,
  p_source_fingerprint text,
  p_note text default ''
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_role(array['owner', 'accounting']::public.staff_role[]) then
    raise exception '仕訳候補を確認する権限がありません。' using errcode = '42501';
  end if;
  if p_amount <= 0 then raise exception '金額は1円以上で入力してください。'; end if;
  if p_review_status not in ('pending', 'confirmed') then raise exception '確認状態が不正です。'; end if;
  if p_review_status = 'confirmed' and p_tax_treatment = 'unconfirmed' then
    raise exception '確認済みにする前に税区分を選択してください。';
  end if;

  insert into public.journal_candidate_reviews (
    source_key, candidate_date, description, debit_account, credit_account, amount,
    tax_treatment, review_status, source_fingerprint, note, reviewed_by, reviewed_at
  ) values (
    p_source_key, p_candidate_date, btrim(p_description), btrim(p_debit_account),
    btrim(p_credit_account), p_amount, p_tax_treatment, p_review_status,
    p_source_fingerprint, btrim(coalesce(p_note, '')),
    case when p_review_status = 'confirmed' then auth.uid() else null end,
    case when p_review_status = 'confirmed' then now() else null end
  )
  on conflict (source_key) do update set
    candidate_date = excluded.candidate_date,
    description = excluded.description,
    debit_account = excluded.debit_account,
    credit_account = excluded.credit_account,
    amount = excluded.amount,
    tax_treatment = excluded.tax_treatment,
    review_status = excluded.review_status,
    source_fingerprint = excluded.source_fingerprint,
    note = excluded.note,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at;
end;
$$;

create or replace function public.record_journal_export(p_target_month date, p_row_count integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_role(array['owner', 'accounting']::public.staff_role[]) then
    raise exception '仕訳CSVを出力する権限がありません。' using errcode = '42501';
  end if;
  if extract(day from p_target_month) <> 1 then raise exception '対象月は月初日で指定してください。'; end if;
  if p_row_count <= 0 then raise exception '出力対象がありません。'; end if;
  insert into public.journal_exports(target_month, row_count)
  values (p_target_month, p_row_count)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.save_journal_candidate_review(text, date, text, text, text, bigint, public.tax_treatment, text, text, text)
from public, anon, authenticated;
grant execute on function public.save_journal_candidate_review(text, date, text, text, text, bigint, public.tax_treatment, text, text, text)
to authenticated;

revoke all on function public.record_journal_export(date, integer) from public, anon, authenticated;
grant execute on function public.record_journal_export(date, integer) to authenticated;
