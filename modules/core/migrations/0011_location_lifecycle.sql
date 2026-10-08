-- Core · a location is tracked only while it is active. Existing rows stay active.
alter table core.locations
  add column status text not null default 'active'
    check (status in ('pending', 'active', 'suspended', 'rejected')),
  add column status_changed_at timestamptz,
  add column status_changed_by text,
  add column status_reason text;

-- Public flows know a location id before any scope exists; this answers one question only.
create function core.public_location_status(loc uuid) returns text
  language sql stable security definer set search_path = core, pg_temp as
  $$ select status from core.locations where id = loc $$;
revoke all on function core.public_location_status(uuid) from public;
grant execute on function core.public_location_status(uuid) to atrium_app;

-- A client scope may add only pending locations; the agency decides every status.
alter policy locations_scope on core.locations
  using (
    core.is_agency() or core.is_assigned(client_id)
    or (client_id = core.current_client_id()
        and (core.visible_location_ids() is null or id = any (core.visible_location_ids())))
  )
  with check (
    core.is_agency() or core.is_assigned(client_id)
    or (client_id = core.current_client_id() and status = 'pending')
  );

-- A client scope may not move a status, only the agency (or its assigned team) may.
create function core.guard_location_status() returns trigger
  language plpgsql as $$
begin
  if new.status is distinct from old.status
     and not core.is_agency() and not core.is_assigned(old.client_id) then
    raise exception 'only the agency can change a location status';
  end if;
  return new;
end $$;
create trigger locations_status_guard before update on core.locations
  for each row execute function core.guard_location_status();
