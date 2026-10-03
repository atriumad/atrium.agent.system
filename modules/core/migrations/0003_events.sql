-- Core · events: the queue schema and the consumer idempotency ledger.
--
-- pg-boss keeps its tables in schema `queue`, owned by the app role so the worker can install
-- and migrate its own tables there. Payloads carry ids only, never personal data.
create schema if not exists queue authorization atrium_app;

-- A consumer records the event id in the same transaction as its effect: if the effect rolls
-- back so does the record, and the retry runs again; if it commits, a second delivery is a no-op.
create table core.processed_events (
  consumer text not null,
  event_id uuid not null,
  client_id uuid not null references core.clients (id) on delete cascade,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);
create index processed_events_client_id_idx on core.processed_events (client_id);

alter table core.processed_events enable row level security;
alter table core.processed_events force row level security;

create policy processed_events_scope on core.processed_events
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());

grant select, insert, delete on core.processed_events to atrium_app;
