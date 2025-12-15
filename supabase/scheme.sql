---① スキーマ作成

create schema if not exists forecast;

---② stores（将来Shopify接続を想定）

create table forecast.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  external_store_id text, -- Shopify store idなど
  created_at timestamptz default now()
);

---③ products / variants（SKU単位）

create table forecast.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references forecast.stores(id),
  product_name text not null,
  sku text not null,
  created_at timestamptz default now(),
  unique (store_id, sku)
);

---④ daily_sales（Fact：確定値）
create table forecast.daily_sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references forecast.stores(id),
  product_id uuid not null references forecast.products(id),
  sales_date date not null,
  quantity integer not null,
  created_at timestamptz default now(),
  unique (product_id, sales_date)
);

---⑤ inventory_snapshots（Fact：確定値）
create table forecast.inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references forecast.stores(id),
  product_id uuid not null references forecast.products(id),
  snapshot_date date not null,
  inventory_level integer not null,
  created_at timestamptz default now(),
  unique (product_id, snapshot_date)
);

---⑥ forecast_results（Prediction：上書き禁止）
create table forecast.forecast_results (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references forecast.stores(id),
  product_id uuid not null references forecast.products(id),
  forecast_date date not null,          -- 予測対象日
  forecast_quantity integer not null,
  model_version text not null,          -- "v0-dummy" でOK
  explanation text,                     -- AI理由
  created_at timestamptz default now()
);

---⑦ forecast_evaluations（予測 vs 実績）
create table forecast.forecast_evaluations (
  id uuid primary key default gen_random_uuid(),
  forecast_result_id uuid not null references forecast.forecast_results(id),
  actual_quantity integer not null,
  error integer not null,
  evaluated_at timestamptz default now()
);

---⑧ インデックス（最低限）
create index on forecast.daily_sales (product_id, sales_date);
create index on forecast.inventory_snapshots (product_id, snapshot_date);
create index on forecast.forecast_results (product_id, forecast_date);