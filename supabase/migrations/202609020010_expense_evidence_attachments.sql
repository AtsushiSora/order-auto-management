-- 経費の領収書・請求書などを非公開Storageへ保存する。
-- 閲覧は事業主・通常スタッフ・経理、追加も同じ3権限、完全削除は事業主だけにする。

drop policy if exists attachments_operations_insert on public.attachments;
create policy attachments_operations_insert
on public.attachments for insert to authenticated
with check (
  private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and created_by = (select auth.uid())
);

drop policy if exists order_auto_private_upload on storage.objects;
create policy order_auto_private_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
  and (storage.foldername(name))[1] in ('vehicles', 'contracts', 'expenses')
);

drop trigger if exists attachments_audit on public.attachments;
create trigger attachments_audit
after insert or update or delete on public.attachments
for each row execute function private.write_audit_log();
