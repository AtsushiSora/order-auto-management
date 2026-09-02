-- 販売サイトへ安全な公開情報だけを渡し、販売・廃車サイトの問い合わせを社内で管理する。

alter table public.vehicles
  add column sales_site_published boolean not null default false,
  add column sold_display_mode text not null default 'show_sold'
    check (sold_display_mode in ('show_sold', 'hidden')),
  add column public_maker text not null default '',
  add column public_grade text not null default '',
  add column public_year text not null default '',
  add column public_mileage text not null default '',
  add column public_color text not null default '',
  add column public_inspection text not null default '',
  add column public_price bigint not null default 0 check (public_price >= 0),
  add column public_description text not null default '',
  add column public_image_url text not null default '';

create index vehicles_sales_site_published_idx
  on public.vehicles(sales_site_published, status)
  where deleted_at is null;

create table public.website_inquiries (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('sales_site', 'scrap_site')),
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 160),
  email text not null default '' check (char_length(email) <= 320),
  phone text not null default '' check (char_length(phone) <= 40),
  message text not null check (char_length(trim(message)) between 1 and 2000),
  interested_vehicle_id uuid references public.vehicles(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'completed')),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_inquiry_contact_required check (
    char_length(trim(email)) > 0 or char_length(trim(phone)) > 0
  )
);

create index website_inquiries_received_at_idx on public.website_inquiries(received_at desc);
create index website_inquiries_status_idx on public.website_inquiries(status, received_at desc);

create trigger website_inquiries_set_updated_at
before update on public.website_inquiries
for each row execute function private.set_updated_columns();

alter table public.website_inquiries enable row level security;

create policy website_inquiries_staff_read
on public.website_inquiries for select to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create policy website_inquiries_staff_update
on public.website_inquiries for update to authenticated
using (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]))
with check (private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]));

create or replace function public.save_vehicle_publication(
  p_vehicle_id uuid,
  p_sales_site_published boolean,
  p_sold_display_mode text,
  p_public_maker text,
  p_public_grade text,
  p_public_year text,
  p_public_mileage text,
  p_public_color text,
  p_public_inspection text,
  p_public_price bigint,
  p_public_description text,
  p_public_image_url text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.vehicle_status;
begin
  if not private.has_role(array['owner', 'regular']::public.staff_role[]) then
    raise exception '販売サイトの公開設定を変更する権限がありません。';
  end if;
  if p_sold_display_mode not in ('show_sold', 'hidden') then
    raise exception '売却後の表示方法を確認してください。';
  end if;
  if p_public_price < 0 then
    raise exception 'サイト表示価格は0円以上で入力してください。';
  end if;

  select status into v_status
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null;

  if v_status is null then
    raise exception '対象車両が見つかりません。';
  end if;
  if p_sales_site_published and v_status not in ('for_sale', 'reserved', 'delivered') then
    raise exception '販売中・売約済み・納車済みの車両だけ公開できます。';
  end if;
  if p_sales_site_published and char_length(trim(p_public_maker)) = 0 then
    raise exception '公開する場合はメーカーを入力してください。';
  end if;

  update public.vehicles
  set
    sales_site_published = p_sales_site_published,
    sold_display_mode = p_sold_display_mode,
    public_maker = trim(p_public_maker),
    public_grade = trim(p_public_grade),
    public_year = trim(p_public_year),
    public_mileage = trim(p_public_mileage),
    public_color = trim(p_public_color),
    public_inspection = trim(p_public_inspection),
    public_price = p_public_price,
    public_description = trim(p_public_description),
    public_image_url = trim(p_public_image_url)
  where id = p_vehicle_id and deleted_at is null;
end;
$$;

create or replace function public.get_public_vehicle_listings()
returns table (
  id uuid,
  number text,
  maker text,
  name text,
  grade text,
  year text,
  mileage text,
  color text,
  inspection text,
  price bigint,
  label text,
  note text,
  image text,
  visible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id,
    v.management_number,
    v.public_maker,
    v.name,
    v.public_grade,
    v.public_year,
    v.public_mileage,
    v.public_color,
    v.public_inspection,
    v.public_price,
    case when v.status = 'for_sale' then '掲載中' else '売約済み' end,
    v.public_description,
    v.public_image_url,
    true
  from public.vehicles v
  where v.deleted_at is null
    and v.sales_site_published = true
    and (
      v.status = 'for_sale'
      or (v.status in ('reserved', 'delivered') and v.sold_display_mode = 'show_sold')
    )
  order by
    case when v.status = 'for_sale' then 0 else 1 end,
    v.updated_at desc
$$;

create or replace function public.submit_website_inquiry(
  p_source text,
  p_customer_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_interested_vehicle_id uuid default null,
  p_website text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
begin
  if char_length(trim(coalesce(p_website, ''))) > 0 then
    raise exception '問い合わせを受け付けられませんでした。';
  end if;
  if p_source not in ('sales_site', 'scrap_site') then
    raise exception '問い合わせ元を確認してください。';
  end if;
  if char_length(trim(coalesce(p_customer_name, ''))) not between 1 and 160 then
    raise exception 'お名前を入力してください。';
  end if;
  if char_length(v_email) = 0 and char_length(v_phone) = 0 then
    raise exception 'メールアドレスまたは電話番号を入力してください。';
  end if;
  if char_length(trim(coalesce(p_message, ''))) not between 1 and 2000 then
    raise exception '問い合わせ内容を入力してください。';
  end if;
  if p_interested_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = p_interested_vehicle_id
      and v.deleted_at is null
      and v.sales_site_published = true
  ) then
    raise exception '対象の掲載車両を確認できませんでした。';
  end if;
  if exists (
    select 1 from public.website_inquiries i
    where i.received_at > now() - interval '1 minute'
      and ((char_length(v_email) > 0 and lower(i.email) = v_email)
        or (char_length(v_phone) > 0 and i.phone = v_phone))
  ) then
    raise exception '同じ内容を受け付けています。少し時間をおいてください。';
  end if;

  insert into public.website_inquiries (
    source, customer_name, email, phone, message, interested_vehicle_id
  ) values (
    p_source, trim(p_customer_name), v_email, v_phone, trim(p_message), p_interested_vehicle_id
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_website_inquiry_status(
  p_inquiry_id uuid,
  p_status text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_role(array['owner', 'regular', 'accounting']::public.staff_role[]) then
    raise exception '問い合わせを変更する権限がありません。';
  end if;
  if p_status not in ('new', 'in_progress', 'completed') then
    raise exception '問い合わせの対応状況を確認してください。';
  end if;

  update public.website_inquiries set status = p_status where id = p_inquiry_id;
  if not found then raise exception '対象の問い合わせが見つかりません。'; end if;
end;
$$;

revoke all on function public.save_vehicle_publication(uuid, boolean, text, text, text, text, text, text, text, bigint, text, text) from public, anon;
grant execute on function public.save_vehicle_publication(uuid, boolean, text, text, text, text, text, text, text, bigint, text, text) to authenticated;

revoke all on function public.get_public_vehicle_listings() from public;
grant execute on function public.get_public_vehicle_listings() to anon, authenticated;

revoke all on function public.submit_website_inquiry(text, text, text, text, text, uuid, text) from public;
grant execute on function public.submit_website_inquiry(text, text, text, text, text, uuid, text) to anon, authenticated;

revoke all on function public.update_website_inquiry_status(uuid, text) from public, anon;
grant execute on function public.update_website_inquiry_status(uuid, text) to authenticated;
