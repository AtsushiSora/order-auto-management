-- Edge Functionが添付ファイルの保全結果を記録するための最小権限。
-- service_roleはサーバー内だけで使用し、ブラウザには公開しない。

grant select, update on table public.system_backups to service_role;
