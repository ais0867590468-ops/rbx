-- Gateway health history: every PIX / card attempt (and manual probe) is recorded
-- so the panel and the Discord bot can tell when the payment processor goes
-- down or comes back. No card data here, only the outcome.

create table if not exists gateway_checks (
  id serial primary key,
  method text not null,
  ok boolean not null,
  status_code integer,
  latency_ms integer,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists gateway_checks_method_idx on gateway_checks (method, created_at desc);
create index if not exists event_logs_created_idx on event_logs (created_at desc);
