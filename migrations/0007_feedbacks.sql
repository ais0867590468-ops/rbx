-- Customer feedback shown in the rolling band on the product / checkout pages.
-- Only REAL feedback lives here: added by the owner in the admin panel or sent
-- by customers after a paid order (those wait for approval before showing).

create table if not exists feedbacks (
  id serial primary key,
  name text not null,
  rating integer not null default 5 check (rating between 1 and 5),
  message text not null,
  robux_amount integer,
  source text not null default 'admin',
  status text not null default 'approved',
  order_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists feedbacks_order_idx on feedbacks (order_id) where order_id is not null;
create index if not exists feedbacks_status_idx on feedbacks (status, created_at desc);
