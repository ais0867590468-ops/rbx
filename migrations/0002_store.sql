-- RecargaBux store schema

create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists staff (
  user_id text primary key,
  role text not null default 'admin',
  email text,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id serial primary key,
  slug text unique not null,
  name text not null,
  robux_amount integer not null,
  price_cents integer not null,
  compare_cents integer,
  sold_count integer not null default 0,
  active boolean not null default true,
  image text not null,
  badge text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  product_id integer references products(id),
  product_name text not null,
  robux_amount integer not null,
  price_cents integer not null,
  roblox_username text not null,
  customer_name text not null,
  customer_email text not null,
  status text not null,
  payment_id text,
  pix_br_code text,
  pix_qr_image text,
  pix_expires_at timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  payer_name text,
  payer_cpf text,
  payer_bank text,
  end_to_end_id text,
  ip text,
  user_agent text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists orders_status_idx on orders (status, created_at desc);
create index if not exists orders_payment_idx on orders (payment_id);
create index if not exists orders_email_idx on orders (customer_email);

create table if not exists tickets (
  id serial primary key,
  public_id text unique not null,
  secret text not null,
  name text not null,
  email text not null,
  order_id text,
  subject text not null,
  status text not null default 'open',
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tickets_status_idx on tickets (status, updated_at desc);

create table if not exists ticket_messages (
  id serial primary key,
  ticket_id integer not null references tickets(id) on delete cascade,
  author_role text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_idx on ticket_messages (ticket_id, created_at);

create table if not exists event_logs (
  id serial primary key,
  kind text not null,
  ip text,
  user_agent text,
  path text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists event_logs_kind_idx on event_logs (kind, created_at desc);
create index if not exists event_logs_ip_idx on event_logs (ip);

create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

insert into products (slug, name, robux_amount, price_cents, compare_cents, sold_count, image, badge, sort_order)
values
  ('1200-robux', '1.200 Robux', 1200, 1990, 2400, 82, '/images/pack-s.jpg', 'Mais pedido', 1),
  ('1700-robux', '1.700 Robux', 1700, 2490, 2600, 117, '/images/pack-s.jpg', null, 2),
  ('2100-robux', '2.100 Robux', 2100, 3590, null, 74, '/images/pack-m.jpg', null, 3),
  ('3600-robux', '3.600 Robux', 3600, 4290, null, 38, '/images/pack-m.jpg', 'Melhor custo', 4),
  ('4500-robux', '4.500 Robux', 4500, 5990, 6490, 152, '/images/pack-m.jpg', null, 5),
  ('7000-robux', '7.000 Robux', 7000, 8990, null, 91, '/images/pack-l.jpg', null, 6),
  ('10000-robux', '10.000 Robux', 10000, 11990, 14299, 137, '/images/pack-l.jpg', 'Top vendas', 7)
on conflict (slug) do nothing;
