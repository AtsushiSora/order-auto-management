-- 業務データのバックアップと一緒に、非公開Storageの添付ファイル本体も保全する。
-- バックアップ本体はEdge Function（service_role）のみが読み書きし、ブラウザからは直接触れない。

alter table public.system_backups
  add column attachment_file_count integer not null default 0 check (attachment_file_count >= 0),
  add column attachment_total_bytes bigint not null default 0 check (attachment_total_bytes >= 0),
  add column attachment_backup_status text not null default 'metadata_only'
    check (attachment_backup_status in ('metadata_only', 'none', 'complete', 'partial', 'failed'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-auto-backups',
  'order-auto-backups',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 認証済み利用者向けのStorageポリシーは意図的に作らない。
-- バックアップファイルはmanage-system-backup Edge Functionからだけ操作する。
