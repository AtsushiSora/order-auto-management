-- 買取契約と0円買取・廃車を重複させず、入庫後の振り分けを在庫側で管理する。
alter table public.vehicles
add column disposition text not null default 'undecided'
check (disposition in ('undecided', 'retail_sale', 'auction', 'scrap'));

comment on column public.vehicles.disposition is
  '買取後の振り分け予定。契約時はundecidedのまま登録でき、入庫後に販売・オークション・廃車を選ぶ。実際の完了状態とは別管理。';

create index vehicles_disposition_idx
  on public.vehicles (disposition)
  where deleted_at is null;
