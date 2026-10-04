-- Core · two narrow lookups for flows that run before any scope exists.
--
-- A public survey link only carries a location. Finding its client has to happen before a scope
-- can be set, and RLS would hide the row, so this function answers exactly that one question.
create function core.client_id_for_location(loc uuid) returns uuid
  language sql stable security definer set search_path = core, pg_temp as
  $$ select client_id from core.locations where id = loc $$;

-- Who is told when something needs a person: the client's owners and the team members assigned
-- to the client. Readable from a client's scope, which cannot see other users' assignments.
create function core.alert_recipients(cid uuid) returns table (user_id text, role text)
  language sql stable security definer set search_path = core, pg_temp as $$
  select m.user_id, m.role
    from core.clients c
    join core.members m on m.organization_id = c.organization_id and m.role = 'client_owner'
   where c.id = cid
  union
  select a.user_id, m.role
    from core.assignments a
    join core.members m on m.user_id = a.user_id and m.role in ('account_manager', 'agency_staff')
   where a.client_id = cid $$;

revoke all on function core.client_id_for_location(uuid), core.alert_recipients(uuid) from public;
grant execute on function core.client_id_for_location(uuid), core.alert_recipients(uuid) to atrium_app;
