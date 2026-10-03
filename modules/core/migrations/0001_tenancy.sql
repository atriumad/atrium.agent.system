-- Core · tenancy: clients and locations, isolated by RLS.
-- The API, worker and agents gateway set the scope per transaction:
--   app.client_id = '<uuid>'  -> one client
--   app.scope     = 'agency'  -> the whole portfolio (agency roles only)
-- No scope set -> no rows. Owner role is subject to RLS too (FORCE).

create schema if not exists core;

create function core.current_client_id() returns uuid
  language sql stable as
  $$ select nullif(current_setting('app.client_id', true), '')::uuid $$;

create function core.is_agency() returns boolean
  language sql stable as
  $$ select coalesce(current_setting('app.scope', true), '') = 'agency' $$;

create table core.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table core.locations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references core.clients (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  time_zone text not null,
  radius_miles integer not null default 10 check (radius_miles between 1 and 100),
  created_at timestamptz not null default now()
);
create index locations_client_id_idx on core.locations (client_id);

alter table core.clients enable row level security;
alter table core.clients force row level security;
alter table core.locations enable row level security;
alter table core.locations force row level security;

create policy clients_scope on core.clients
  using (core.is_agency() or id = core.current_client_id())
  with check (core.is_agency());

create policy locations_scope on core.locations
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());

grant usage on schema core to atrium_app;
grant execute on function core.current_client_id(), core.is_agency() to atrium_app;
grant select, insert, update, delete on core.clients, core.locations to atrium_app;
