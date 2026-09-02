-- Google Driveへ手動保存した履歴を、バックアップ単位で確認できるようにする。

alter table public.system_backups
  add column drive_folder_id text,
  add column drive_folder_url text,
  add column drive_saved_at timestamptz,
  add constraint system_backups_drive_consistency check (
    (drive_folder_id is null and drive_folder_url is null and drive_saved_at is null)
    or (drive_folder_id is not null and drive_folder_url is not null and drive_saved_at is not null)
  );
