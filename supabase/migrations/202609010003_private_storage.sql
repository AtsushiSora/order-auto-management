-- 契約書、署名、本人確認書類、車両写真などは公開URLにしない。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-auto-private',
  'order-auto-private',
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

create policy order_auto_private_read
on storage.objects for select to authenticated
using (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[])
);

create policy order_auto_private_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular']::public.staff_role[])
  and (storage.foldername(name))[1] in ('vehicles', 'contracts', 'expenses')
);

create policy order_auto_private_update
on storage.objects for update to authenticated
using (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular']::public.staff_role[])
)
with check (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner', 'regular']::public.staff_role[])
);

create policy order_auto_private_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'order-auto-private'
  and private.has_role(array['owner']::public.staff_role[])
);

