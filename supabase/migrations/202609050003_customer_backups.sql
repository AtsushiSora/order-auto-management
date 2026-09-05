-- 顧客台帳と連絡履歴を月次バックアップ・復元の対象へ追加する。

create or replace function public.create_system_backup()
returns public.system_backups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_row_count integer;
  v_backup public.system_backups;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception 'バックアップを作成できるのは事業主だけです。';
  end if;

  perform pg_advisory_xact_lock(hashtext('order_auto_system_backup'));
  v_payload := jsonb_build_object(
    'customers', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.customers as source_row), '[]'::jsonb),
    'customer_contact_logs', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.customer_contact_logs as source_row), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.vehicles as source_row), '[]'::jsonb),
    'vehicle_documents', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.vehicle_documents as source_row), '[]'::jsonb),
    'contracts', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.contracts as source_row), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.expenses as source_row), '[]'::jsonb),
    'staff_settlements', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.staff_settlements as source_row), '[]'::jsonb),
    'cashflows', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.cashflows as source_row), '[]'::jsonb),
    'cashflow_offsets', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.cashflow_offsets as source_row), '[]'::jsonb),
    'cashflow_events', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.cashflow_events as source_row), '[]'::jsonb),
    'issued_documents', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.issued_documents as source_row), '[]'::jsonb),
    'spot_assignments', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.spot_assignments as source_row), '[]'::jsonb),
    'contract_handoffs', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.contract_handoffs as source_row), '[]'::jsonb),
    'antique_ledger_details', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.antique_ledger_details as source_row), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.approvals as source_row), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.attachments as source_row), '[]'::jsonb),
    'website_inquiries', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.website_inquiries as source_row), '[]'::jsonb),
    'journal_candidate_reviews', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.journal_candidate_reviews as source_row), '[]'::jsonb),
    'journal_exports', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.journal_exports as source_row), '[]'::jsonb),
    'monthly_balance_checks', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.monthly_balance_checks as source_row), '[]'::jsonb),
    'app_settings', coalesce((select jsonb_agg(to_jsonb(source_row)) from public.app_settings as source_row), '[]'::jsonb)
  );

  select coalesce(sum(jsonb_array_length(value)), 0)::integer into v_row_count from jsonb_each(v_payload);
  insert into public.system_backups(row_count, payload) values (v_row_count, v_payload) returning * into v_backup;
  return v_backup;
end;
$$;

create or replace function public.restore_system_backup(p_backup_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '復元できるのは事業主だけです。';
  end if;
  if p_mode not in ('merge', 'replace') then raise exception '復元方法を確認してください。'; end if;

  perform pg_advisory_xact_lock(hashtext('order_auto_system_backup'));
  select payload into v_payload from public.system_backups where id = p_backup_id;
  if v_payload is null then raise exception 'バックアップが見つかりません。'; end if;
  perform set_config('order_auto.restore_mode', 'on', true);

  if p_mode = 'replace' then
    delete from public.customer_contact_logs where true;
    delete from public.contract_handoffs where true;
    delete from public.spot_assignments where true;
    delete from public.issued_documents where true;
    delete from public.cashflow_events where true;
    delete from public.cashflow_offsets where true;
    delete from public.cashflows where true;
    delete from public.staff_settlements where true;
    delete from public.attachments where true;
    delete from public.approvals where true;
    delete from public.antique_ledger_details where true;
    delete from public.vehicle_documents where true;
    delete from public.website_inquiries where true;
    delete from public.expenses where true;
    update public.contracts set supersedes_contract_id = null where supersedes_contract_id is not null;
    delete from public.contracts where true;
    delete from public.customers where true;
    update public.vehicles set previous_vehicle_id = null where previous_vehicle_id is not null;
    delete from public.vehicles where true;
    delete from public.journal_candidate_reviews where true;
    delete from public.journal_exports where true;
    delete from public.monthly_balance_checks where true;
    delete from public.app_settings where true;
  end if;

  insert into public.customers select * from jsonb_populate_recordset(null::public.customers, coalesce(v_payload->'customers', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.vehicles select * from jsonb_populate_recordset(null::public.vehicles, coalesce(v_payload->'vehicles', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.vehicle_documents select * from jsonb_populate_recordset(null::public.vehicle_documents, coalesce(v_payload->'vehicle_documents', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.contracts select * from jsonb_populate_recordset(null::public.contracts, coalesce(v_payload->'contracts', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.customer_contact_logs select * from jsonb_populate_recordset(null::public.customer_contact_logs, coalesce(v_payload->'customer_contact_logs', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.expenses select * from jsonb_populate_recordset(null::public.expenses, coalesce(v_payload->'expenses', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.staff_settlements select * from jsonb_populate_recordset(null::public.staff_settlements, coalesce(v_payload->'staff_settlements', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.cashflows select * from jsonb_populate_recordset(null::public.cashflows, coalesce(v_payload->'cashflows', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.cashflow_offsets select * from jsonb_populate_recordset(null::public.cashflow_offsets, coalesce(v_payload->'cashflow_offsets', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.cashflow_events select * from jsonb_populate_recordset(null::public.cashflow_events, coalesce(v_payload->'cashflow_events', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.issued_documents select * from jsonb_populate_recordset(null::public.issued_documents, coalesce(v_payload->'issued_documents', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.spot_assignments select * from jsonb_populate_recordset(null::public.spot_assignments, coalesce(v_payload->'spot_assignments', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.contract_handoffs select * from jsonb_populate_recordset(null::public.contract_handoffs, coalesce(v_payload->'contract_handoffs', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.antique_ledger_details select * from jsonb_populate_recordset(null::public.antique_ledger_details, coalesce(v_payload->'antique_ledger_details', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.approvals select * from jsonb_populate_recordset(null::public.approvals, coalesce(v_payload->'approvals', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.attachments select * from jsonb_populate_recordset(null::public.attachments, coalesce(v_payload->'attachments', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.website_inquiries select * from jsonb_populate_recordset(null::public.website_inquiries, coalesce(v_payload->'website_inquiries', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.journal_candidate_reviews select * from jsonb_populate_recordset(null::public.journal_candidate_reviews, coalesce(v_payload->'journal_candidate_reviews', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.journal_exports select * from jsonb_populate_recordset(null::public.journal_exports, coalesce(v_payload->'journal_exports', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.monthly_balance_checks select * from jsonb_populate_recordset(null::public.monthly_balance_checks, coalesce(v_payload->'monthly_balance_checks', '[]'::jsonb)) on conflict (id) do nothing;
  insert into public.app_settings select * from jsonb_populate_recordset(null::public.app_settings, coalesce(v_payload->'app_settings', '[]'::jsonb)) on conflict (key) do nothing;
end;
$$;

revoke all on function public.create_system_backup() from public, anon;
grant execute on function public.create_system_backup() to authenticated;
revoke all on function public.restore_system_backup(uuid, text) from public, anon;
grant execute on function public.restore_system_backup(uuid, text) to authenticated;

