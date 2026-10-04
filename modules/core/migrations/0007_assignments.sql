-- Core · assignments.
--   account_manager and agency_staff see only the clients assigned to them.
--   client_staff sees only the locations assigned to them.
-- Enforced in RLS, not only in the application: a session scoped 'assigned' carries app.user_id,
-- and every client-owned policy adds core.is_assigned(client_id). An unassigned user sees nothing.

create table core.assignments (
  user_id text not null references core.users (id) on delete cascade,
  client_id uuid not null references core.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text not null,
  primary key (user_id, client_id)
);
create index assignments_client_id_idx on core.assignments (client_id);

create table core.location_assignments (
  user_id text not null references core.users (id) on delete cascade,
  client_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  primary key (user_id, location_id),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index location_assignments_client_idx on core.location_assignments (client_id);

create function core.current_user_id() returns text
  language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '') $$;

-- security definer: the check must read assignments whatever the caller's own policies allow.
create function core.is_assigned(cid uuid) returns boolean
  language sql stable security definer set search_path = core, pg_temp as
  $$ select coalesce(current_setting('app.scope', true), '') = 'assigned'
       and exists (
         select 1 from core.assignments a
         where a.client_id = cid and a.user_id = nullif(current_setting('app.user_id', true), '')
       ) $$;

-- null means "every location"; a list narrows. The session setting is a comma list of uuids.
create function core.visible_location_ids() returns uuid[]
  language sql stable as
  $$ select string_to_array(nullif(current_setting('app.location_ids', true), ''), ',')::uuid[] $$;

-- Used when resolving a session, before any scope exists. Returns the locations assigned to a
-- user within a client; an empty array means none (and the session then sees no locations).
create function core.location_ids_for_user(uid text, cid uuid) returns uuid[]
  language sql stable security definer set search_path = core, pg_temp as
  $$ select coalesce(array_agg(location_id), '{}') from core.location_assignments
     where user_id = uid and client_id = cid $$;

revoke all on function core.is_assigned(uuid), core.location_ids_for_user(text, uuid) from public;
grant execute on function
  core.current_user_id(), core.is_assigned(uuid), core.visible_location_ids(),
  core.location_ids_for_user(text, uuid) to atrium_app;

alter table core.assignments enable row level security;
alter table core.assignments force row level security;
alter table core.location_assignments enable row level security;
alter table core.location_assignments force row level security;

-- Seeing who is assigned where: the agency, or the user themself.
create policy assignments_read on core.assignments for select
  using (core.is_agency() or user_id = core.current_user_id());
create policy assignments_write on core.assignments for all
  using (core.is_agency()) with check (core.is_agency());

-- A client's owner may assign their own staff to their own locations.
create policy location_assignments_read on core.location_assignments for select
  using (core.is_agency() or client_id = core.current_client_id() or user_id = core.current_user_id());
create policy location_assignments_write on core.location_assignments for all
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());

grant select, insert, delete on core.assignments, core.location_assignments to atrium_app;

-- Widen every client-owned policy: agency, this client, or a client assigned to the session user.
alter policy clients_scope on core.clients
  using (core.is_agency() or id = core.current_client_id() or core.is_assigned(id))
  with check (core.is_agency());

alter policy locations_scope on core.locations
  using (
    core.is_agency() or core.is_assigned(client_id)
    or (client_id = core.current_client_id()
        and (core.visible_location_ids() is null or id = any (core.visible_location_ids())))
  )
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());

alter policy processed_events_scope on core.processed_events
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
alter policy guests_scope on core.guests
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
alter policy guest_identifiers_scope on core.guest_identifiers
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
alter policy consents_scope on core.consents
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
alter policy audit_log_scope on core.audit_log
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
alter policy approval_requests_scope on core.approval_requests
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());

-- Reading a client's package and overrides follows the assignment; changing them stays with
-- agency scope (a package is a commercial decision).
alter policy client_packages_read on core.client_packages
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
alter policy feature_overrides_read on core.feature_overrides
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());

-- "Anyone with an agency role" can switch an agent off for a client they are assigned to.
-- A global switch (no client) stays with agency scope.
alter policy kill_switches_read on core.kill_switches
  using (
    core.is_agency() or client_id is null
    or core.is_assigned(client_id) or client_id = core.current_client_id()
  );
alter policy kill_switches_write on core.kill_switches
  using (core.is_agency() or (client_id is not null and core.is_assigned(client_id)))
  with check (core.is_agency() or (client_id is not null and core.is_assigned(client_id)));
