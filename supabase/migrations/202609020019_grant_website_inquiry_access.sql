-- サイト問い合わせはRLSで社内利用者に制限済みだが、
-- テーブル権限が未付与だったため、管理画面からの参照・状態更新を許可する。

revoke all on table public.website_inquiries from public, anon, authenticated;
grant select, update on table public.website_inquiries to authenticated;
