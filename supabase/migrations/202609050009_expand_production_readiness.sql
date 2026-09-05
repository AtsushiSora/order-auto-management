-- 顧客管理・スタッフ登録・経費申請の追加後も、本番承認を全項目の確認後だけに制限する。

create or replace function public.save_production_readiness_check(
  p_check_key text,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_keys constant text[] := array[
    'purchase_standard', 'purchase_zero', 'sale_delivery', 'trade_in',
    'auction_scrap', 'cashflow', 'expenses_profit', 'antique_ledger',
    'documents_accounting', 'staff_settlement', 'expense_approval',
    'customer_management', 'staff_onboarding', 'permissions',
    'contract_site_links', 'real_devices', 'backup_restore'
  ];
  v_current jsonb;
  v_checked_at jsonb;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '本番前チェックを変更できるのは事業主だけです。';
  end if;
  if not (p_check_key = any(v_allowed_keys)) then
    raise exception '確認項目が不正です。';
  end if;
  if p_status not in ('pending', 'passed', 'needs_fix') then
    raise exception '確認結果が不正です。';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception '確認メモは1000文字以内で入力してください。';
  end if;

  select value into v_current from public.app_settings where key = 'production_readiness' for update;
  v_current := jsonb_build_object(
    'version', 2,
    'checks', '{}'::jsonb,
    'approvedAt', null,
    'approvedBy', null
  ) || coalesce(v_current, '{}'::jsonb);
  v_current := jsonb_set(v_current, '{version}', '2'::jsonb);
  v_checked_at := case when p_status = 'pending' then 'null'::jsonb else to_jsonb(now()) end;
  v_current := jsonb_set(
    v_current,
    array['checks', p_check_key],
    jsonb_build_object('status', p_status, 'note', trim(coalesce(p_note, '')), 'checkedAt', v_checked_at),
    true
  );
  v_current := jsonb_set(jsonb_set(v_current, '{approvedAt}', 'null'::jsonb), '{approvedBy}', 'null'::jsonb);

  insert into public.app_settings(key, value, updated_by)
  values ('production_readiness', v_current, auth.uid())
  on conflict (key) do update
  set value = excluded.value, updated_by = auth.uid(), updated_at = now();
end;
$$;

create or replace function public.set_production_readiness_approval(p_approved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_keys constant text[] := array[
    'purchase_standard', 'purchase_zero', 'sale_delivery', 'trade_in',
    'auction_scrap', 'cashflow', 'expenses_profit', 'antique_ledger',
    'documents_accounting', 'staff_settlement', 'expense_approval',
    'customer_management', 'staff_onboarding', 'permissions',
    'contract_site_links', 'real_devices', 'backup_restore'
  ];
  v_current jsonb;
  v_confirmed integer;
begin
  if not private.has_role(array['owner']::public.staff_role[]) then
    raise exception '本番利用を承認できるのは事業主だけです。';
  end if;

  select value into v_current from public.app_settings where key = 'production_readiness' for update;
  if v_current is null then
    raise exception '本番前チェックがまだ保存されていません。';
  end if;

  if p_approved then
    select count(*) into v_confirmed
    from unnest(v_allowed_keys) as item(check_key)
    where v_current #>> array['checks', item.check_key, 'status'] = 'passed';
    if v_confirmed <> cardinality(v_allowed_keys) then
      raise exception 'すべての確認項目を確認済みにしてから承認してください。';
    end if;
    v_current := jsonb_set(
      jsonb_set(v_current, '{approvedAt}', to_jsonb(now())),
      '{approvedBy}', to_jsonb(auth.uid()::text)
    );
  else
    v_current := jsonb_set(jsonb_set(v_current, '{approvedAt}', 'null'::jsonb), '{approvedBy}', 'null'::jsonb);
  end if;

  update public.app_settings
  set value = v_current, updated_by = auth.uid(), updated_at = now()
  where key = 'production_readiness';
end;
$$;

-- 旧14項目だけで付けた承認は、新しい3項目の確認が終わるまで保留へ戻す。
update public.app_settings
set value = jsonb_set(jsonb_set(value, '{approvedAt}', 'null'::jsonb), '{approvedBy}', 'null'::jsonb),
    updated_at = now()
where key = 'production_readiness';

revoke all on function public.save_production_readiness_check(text, text, text) from public, anon;
grant execute on function public.save_production_readiness_check(text, text, text) to authenticated;
revoke all on function public.set_production_readiness_approval(boolean) from public, anon;
grant execute on function public.set_production_readiness_approval(boolean) to authenticated;
