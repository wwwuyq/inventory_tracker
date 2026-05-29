create table if not exists retail_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  shipping_address text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text,
  category text,
  default_wholesale_price numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table retail_stores add column if not exists contact_name text;
alter table retail_stores add column if not exists email text;
alter table retail_stores add column if not exists phone text;
alter table retail_stores add column if not exists shipping_address text;
alter table retail_stores add column if not exists notes text;
alter table retail_stores add column if not exists monthly_sales_reminder boolean not null default true;
alter table retail_stores add column if not exists sales_data_note text;

alter table products add column if not exists name text;
alter table products add column if not exists category text;
alter table products add column if not exists default_wholesale_price numeric(12, 2) not null default 0;
alter table products add column if not exists notes text;

alter table retail_stores enable row level security;
alter table products enable row level security;

drop policy if exists "Authenticated staff can read retail stores" on retail_stores;
drop policy if exists "Authenticated staff can insert retail stores" on retail_stores;
drop policy if exists "Authenticated staff can update retail stores" on retail_stores;
drop policy if exists "Authenticated staff can read products" on products;
drop policy if exists "Authenticated staff can insert products" on products;
drop policy if exists "Authenticated staff can update products" on products;

create policy "Authenticated staff can read retail stores"
on retail_stores for select to authenticated using (true);
create policy "Authenticated staff can insert retail stores"
on retail_stores for insert to authenticated with check (true);
create policy "Authenticated staff can update retail stores"
on retail_stores for update to authenticated using (true) with check (true);

create policy "Authenticated staff can read products"
on products for select to authenticated using (true);
create policy "Authenticated staff can insert products"
on products for insert to authenticated with check (true);
create policy "Authenticated staff can update products"
on products for update to authenticated using (true) with check (true);
