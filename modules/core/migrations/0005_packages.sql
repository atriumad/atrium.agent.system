-- Core · packages and feature access.
-- One package per client; overrides per client or per location ("Manage access" in the Manager).
-- Clients can read their own access but only the agency can change it: the policies' WITH CHECK
-- allows writes under agency scope only, so a client's own session can never unlock a section.

-- A location is addressable together with its client, so an override cannot point at a location
-- of another client.
alter table core.locations add constraint locations_client_id_id_key unique (client_id, id);

create table core.client_packages (
  client_id uuid primary key references core.clients (id) on delete cascade,
  package text not null check (package in ('essential', 'pillar_2', 'pillar_3')),
  -- Carrier registration (10DLC) approved. SMS stays off until it is, whatever the package.
  sms_registered boolean not null default false,
  updated_at timestamptz not null default now()
);

create table core.feature_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references core.clients (id) on delete cascade,
  location_id uuid,
  feature text not null check (feature in
    ('content', 'analytics', 'discoverability', 'reputation', 'retention',
     'attribution', 'growth', 'management', 'benchmarks')),
  level text not null check (level in ('locked', 'basic', 'full')),
  note text,
  created_at timestamptz not null default now(),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade,
  unique nulls not distinct (client_id, location_id, feature)
);

alter table core.client_packages enable row level security;
alter table core.client_packages force row level security;
alter table core.feature_overrides enable row level security;
alter table core.feature_overrides force row level security;

create policy client_packages_read on core.client_packages for select
  using (core.is_agency() or client_id = core.current_client_id());
create policy client_packages_write on core.client_packages for all
  using (core.is_agency()) with check (core.is_agency());

create policy feature_overrides_read on core.feature_overrides for select
  using (core.is_agency() or client_id = core.current_client_id());
create policy feature_overrides_write on core.feature_overrides for all
  using (core.is_agency()) with check (core.is_agency());

grant select, insert, update on core.client_packages to atrium_app;
grant select, insert, update, delete on core.feature_overrides to atrium_app;
