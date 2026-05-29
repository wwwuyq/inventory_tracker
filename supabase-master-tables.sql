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

create table if not exists manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  default_manufacturer_id uuid references manufacturers(id),
  default_retail_store_id uuid references retail_stores(id),
  sku text not null unique,
  name text,
  category text,
  default_wholesale_price numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table retail_stores enable row level security;
alter table manufacturers enable row level security;
alter table products enable row level security;

drop policy if exists "Authenticated staff can read retail stores" on retail_stores;
drop policy if exists "Authenticated staff can insert retail stores" on retail_stores;
drop policy if exists "Authenticated staff can update retail stores" on retail_stores;
drop policy if exists "Authenticated staff can read manufacturers" on manufacturers;
drop policy if exists "Authenticated staff can insert manufacturers" on manufacturers;
drop policy if exists "Authenticated staff can update manufacturers" on manufacturers;
drop policy if exists "Authenticated staff can read products" on products;
drop policy if exists "Authenticated staff can insert products" on products;
drop policy if exists "Authenticated staff can update products" on products;

create policy "Authenticated staff can read retail stores"
on retail_stores for select to authenticated using (true);
create policy "Authenticated staff can insert retail stores"
on retail_stores for insert to authenticated with check (true);
create policy "Authenticated staff can update retail stores"
on retail_stores for update to authenticated using (true) with check (true);

create policy "Authenticated staff can read manufacturers"
on manufacturers for select to authenticated using (true);
create policy "Authenticated staff can insert manufacturers"
on manufacturers for insert to authenticated with check (true);
create policy "Authenticated staff can update manufacturers"
on manufacturers for update to authenticated using (true) with check (true);

create policy "Authenticated staff can read products"
on products for select to authenticated using (true);
create policy "Authenticated staff can insert products"
on products for insert to authenticated with check (true);
create policy "Authenticated staff can update products"
on products for update to authenticated using (true) with check (true);
