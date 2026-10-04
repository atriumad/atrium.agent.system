-- Core · notifications. Docs: modules / Core (Notifications), ADR 0017.
-- Every send goes through one door that checks consent (guests) and records what was sent.
-- The development transport only records: nothing leaves the machine. A provider transport
-- (Twilio) replaces it without touching the callers.
-- The table keeps the recipient masked: the real address is read from Core at send time and is
-- never copied here, so erasing a guest leaves nothing to scrub.

create table core.notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references core.clients (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null check (purpose in ('transactional', 'marketing')),
  recipient_type text not null check (recipient_type in ('guest', 'user')),
  recipient_id text not null,
  to_masked text not null,
  subject text,
  body text not null,
  transport text not null default 'dev',
  status text not null default 'recorded' check (status in ('recorded', 'sent', 'failed')),
  created_at timestamptz not null default now()
);
create index notifications_client_idx on core.notifications (client_id, created_at desc);

alter table core.notifications enable row level security;
alter table core.notifications force row level security;

create policy notifications_scope on core.notifications
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());

grant select, insert on core.notifications to atrium_app;
