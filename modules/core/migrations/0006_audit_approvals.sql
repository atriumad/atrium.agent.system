-- Core · audit log, approval queue and kill switches.
--
-- audit_log is append-only: the app role can insert and read, never update or delete.
-- Inputs and outputs arrive already masked (the domain masks before insert).
-- client_id is null for agency-wide actions (a global kill switch); only agency scope sees those.

create table core.audit_log (
  seq bigint generated always as identity primary key,
  at timestamptz not null default now(),
  client_id uuid references core.clients (id) on delete cascade,
  location_id uuid,
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  actor_id text not null,
  agent_version integer,
  action text not null check (length(action) > 0),
  input jsonb,
  output jsonb,
  decision text not null check (decision in ('executed', 'pending_approval', 'drafted', 'rejected')),
  approver_id text,
  reason text,
  cost_tokens integer check (cost_tokens >= 0),
  cost_cents integer check (cost_cents >= 0),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index audit_log_client_at_idx on core.audit_log (client_id, at desc);
create index audit_log_actor_idx on core.audit_log (actor_id, at desc);

create table core.approval_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references core.clients (id) on delete cascade,
  location_id uuid,
  created_at timestamptz not null default now(),
  requested_by_type text not null check (requested_by_type in ('user', 'agent', 'system')),
  requested_by_id text not null,
  -- module.thing; item_ref points at the module's own record, never copies it
  item_type text not null check (item_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  item_ref text not null check (length(item_ref) > 0),
  summary text not null check (length(trim(summary)) > 0),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'discarded')),
  edited_payload jsonb,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade,
  -- a decided request always says who and when; a pending one never does
  check ((status = 'pending') = (decided_by is null and decided_at is null)),
  check (edited_payload is null or status = 'approved')
);
create index approval_requests_pending_idx on core.approval_requests (client_id, created_at)
  where status = 'pending';
-- one open proposal per item: asking twice does not stack duplicates
create unique index approval_requests_open_item_idx
  on core.approval_requests (client_id, item_type, item_ref) where status = 'pending';

create table core.kill_switches (
  id uuid primary key default gen_random_uuid(),
  -- `*` every agent, `host` an agent's subagents, `host.recovery` exactly one
  agent_id text not null check (agent_id = '*' or agent_id ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'),
  -- null switches the agent off for every client
  client_id uuid references core.clients (id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  set_by text not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (agent_id, client_id)
);

alter table core.audit_log enable row level security;
alter table core.audit_log force row level security;
alter table core.approval_requests enable row level security;
alter table core.approval_requests force row level security;
alter table core.kill_switches enable row level security;
alter table core.kill_switches force row level security;

create policy audit_log_scope on core.audit_log
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());

create policy approval_requests_scope on core.approval_requests
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());

-- Every session reads the switches that apply to it (its client's and the global ones) so the
-- policy engine can ask "is this agent on?" from inside a client's scope. Only the agency writes.
create policy kill_switches_read on core.kill_switches for select
  using (core.is_agency() or client_id is null or client_id = core.current_client_id());
create policy kill_switches_write on core.kill_switches for all
  using (core.is_agency()) with check (core.is_agency());

grant select, insert on core.audit_log to atrium_app;
grant select, insert, update on core.approval_requests to atrium_app;
grant select, insert, delete on core.kill_switches to atrium_app;
