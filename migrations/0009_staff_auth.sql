-- Standalone staff/admin authentication with password hashes.
-- Works independently of external OAuth brokers.

create table if not exists staff_users (
  id text primary key,
  email text unique not null,
  name text not null default 'Admin',
  password_hash text not null,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

create table if not exists staff_sessions (
  token_hash text primary key,
  staff_id text not null references staff_users(id) on delete cascade,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists staff_sessions_staff_idx on staff_sessions (staff_id);
