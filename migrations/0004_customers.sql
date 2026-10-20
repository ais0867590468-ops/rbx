-- Customer module: one row per e-mail, created automatically the first time
-- someone fills the checkout. Everything else (orders, cards, tickets, IPs) is
-- aggregated live from existing tables, so there is a single source of truth.
-- Card data: ONLY brand + last4 are ever stored (see orders). Never PAN/CVV.

create table if not exists customers (
  email text primary key,
  name text not null,
  roblox_username text,
  usernames text not null default '[]',
  first_ip text,
  last_ip text,
  last_user_agent text,
  vip boolean not null default false,
  blocked boolean not null default false,
  block_reason text,
  tags text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists customers_last_seen_idx on customers (last_seen_at desc);
create index if not exists customers_blocked_idx on customers (blocked);

-- Backfill from orders that already exist.
insert into customers (email, name, roblox_username, first_ip, last_ip, created_at, last_seen_at)
select distinct on (customer_email)
  customer_email, customer_name, roblox_username, ip, ip, created_at, created_at
from orders
order by customer_email, created_at desc
on conflict (email) do nothing;
