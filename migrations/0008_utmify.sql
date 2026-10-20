-- UTMify integration: marketing attribution per order + log of every order event
-- sent to UTMify (so the panel can show failures and resend).

alter table orders add column if not exists tracking text;

create table if not exists utmify_events (
  id serial primary key,
  order_id text not null,
  status text not null,
  ok boolean not null default false,
  http_status integer,
  error text,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists utmify_events_order_idx on utmify_events (order_id, status);
create index if not exists utmify_events_created_idx on utmify_events (created_at desc);
