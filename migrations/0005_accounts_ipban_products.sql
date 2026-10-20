-- Optional customer accounts, IP ban list and extra Robux variations.
-- Passwords are NEVER stored in plain text: only a salted scrypt hash.

create table if not exists shop_users (
  id text primary key,
  email text unique not null,
  name text not null default '',
  password_hash text not null,
  banned boolean not null default false,
  ban_reason text,
  login_count integer not null default 0,
  signup_ip text,
  last_ip text,
  last_user_agent text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists shop_sessions (
  token_hash text primary key,
  user_id text not null references shop_users(id) on delete cascade,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists shop_sessions_user_idx on shop_sessions (user_id);

create table if not exists blocked_ips (
  ip text primary key,
  reason text not null default '',
  banned_by text,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- Second row of the package rail: more Robux variations.
insert into products (slug, name, robux_amount, price_cents, compare_cents, sold_count, image, badge, sort_order)
values
  ('2500-robux', '2.500 Robux', 2500, 3490, 3990, 58, '/images/pack-m.jpg', null, 9),
  ('5000-robux', '5.000 Robux', 5000, 6490, 7490, 77, '/images/pack-m.jpg', 'Popular', 10),
  ('8000-robux', '8.000 Robux', 8000, 9990, 11490, 43, '/images/pack-l.jpg', null, 11),
  ('15000-robux', '15.000 Robux', 15000, 17490, 20990, 29, '/images/pack-l.jpg', 'Econômico', 12),
  ('20000-robux', '20.000 Robux', 20000, 22990, 27990, 21, '/images/pack-l.jpg', null, 13),
  ('25000-robux', '25.000 Robux', 25000, 27990, 34990, 14, '/images/pack-l.jpg', null, 14),
  ('40000-robux', '40.000 Robux', 40000, 43990, 55990, 9, '/images/pack-l.jpg', 'Mega', 15)
on conflict (slug) do nothing;
