-- Reputation · the review button is a public link too. It carries a response id, and finding the
-- client behind it has to happen before any scope exists.
create function reputation.resolve_response(rid uuid)
  returns table (client_id uuid, location_id uuid)
  language sql stable security definer set search_path = reputation, pg_temp as $$
  select r.client_id, r.location_id from reputation.survey_responses r where r.id = rid $$;
revoke all on function reputation.resolve_response(uuid) from public;
grant execute on function reputation.resolve_response(uuid) to atrium_app;
