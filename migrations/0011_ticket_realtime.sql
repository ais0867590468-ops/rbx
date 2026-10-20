-- Real-time ticket chat: "digitando..." and "visto" markers for both sides.
alter table tickets add column if not exists customer_typing_at timestamptz;
alter table tickets add column if not exists admin_typing_at timestamptz;
alter table tickets add column if not exists customer_seen_at timestamptz;
alter table tickets add column if not exists admin_seen_at timestamptz;

create index if not exists ticket_messages_ticket_id_idx on ticket_messages (ticket_id, id);
