create table products (
  id uuid primary key default gen_random_uuid(),
  default_manufacturer_id uuid,
  default_retail_store_id uuid,
  sku text not null unique,
  name text,
  category text,
  default_wholesale_price numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table retail_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  shipping_address text,
  notes text,
  created_at timestamptz not null default now()
);

create table manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

alter table products
  add constraint products_default_manufacturer_id_fkey foreign key (default_manufacturer_id) references manufacturers(id),
  add constraint products_default_retail_store_id_fkey foreign key (default_retail_store_id) references retail_stores(id);

create table manufacturing_orders (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references manufacturers(id),
  reference text,
  status text not null default 'open',
  due_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table manufacturing_order_items (
  id uuid primary key default gen_random_uuid(),
  manufacturing_order_id uuid not null references manufacturing_orders(id) on delete cascade,
  product_id uuid references products(id),
  sku text not null,
  quantity_ordered integer not null default 0,
  quantity_produced integer not null default 0,
  quantity_shipped integer not null default 0,
  unit_price numeric(12, 2) not null default 0
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  manufacturing_order_id uuid references manufacturing_orders(id) on delete cascade,
  amount numeric(12, 2) not null,
  paid_at date,
  method text,
  notes text,
  created_at timestamptz not null default now()
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references manufacturers(id),
  carrier text,
  tracking_number text,
  ship_date date,
  estimated_arrival date,
  actual_arrival date,
  status text not null default 'in_transit',
  notes text,
  created_at timestamptz not null default now()
);

create table shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  product_id uuid references products(id),
  sku text not null,
  quantity integer not null default 0
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  sku text not null,
  movement_type text not null check (movement_type in ('received', 'sent', 'reserved', 'adjustment')),
  quantity integer not null,
  location text,
  movement_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table retail_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  retail_store_id uuid references retail_stores(id),
  customer_name text not null,
  po_number text not null,
  invoice_status text not null default 'not_sent',
  invoice_amount numeric(12, 2) not null default 0,
  due_date date,
  shopify_order_id text,
  notes text,
  created_at timestamptz not null default now()
);

create table retail_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  retail_purchase_order_id uuid not null references retail_purchase_orders(id) on delete cascade,
  product_id uuid references products(id),
  sku text not null,
  quantity_ordered integer not null default 0,
  quantity_sent integer not null default 0
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text,
  mime_type text,
  source_type text not null default 'upload',
  ocr_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table ocr_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  extracted_text text,
  extracted_json jsonb not null default '{}'::jsonb,
  reviewed boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_manufacturing_order_items_sku on manufacturing_order_items(sku);
create index idx_shipment_items_sku on shipment_items(sku);
create index idx_inventory_movements_sku on inventory_movements(sku);
create index idx_retail_po_items_sku on retail_purchase_order_items(sku);
create index idx_documents_ocr_status on documents(ocr_status);
