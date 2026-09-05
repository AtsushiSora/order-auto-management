-- 個人顧客の名字・名前を分けて保持する。display_name は既存の検索・契約連携用に残す。
alter table public.customers
  add column last_name text not null default '',
  add column first_name text not null default '';

update public.customers
set
  last_name = case
    when entity_type = 'individual' then split_part(regexp_replace(btrim(display_name), '\\s+', ' ', 'g'), ' ', 1)
    else ''
  end,
  first_name = case
    when entity_type = 'individual' and position(' ' in regexp_replace(btrim(display_name), '\\s+', ' ', 'g')) > 0
      then btrim(substring(regexp_replace(btrim(display_name), '\\s+', ' ', 'g') from position(' ' in regexp_replace(btrim(display_name), '\\s+', ' ', 'g')) + 1))
    else ''
  end;
