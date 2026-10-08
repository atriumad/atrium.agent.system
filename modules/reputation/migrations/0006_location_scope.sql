-- Reputation · a location-scoped client user (a location manager) sees only the responses and
-- cases of their own locations. core.visible_location_ids() is null for the owner and the agency,
-- so they are unaffected. Any other reputation table a location manager can read later must adopt
-- the same predicate.
do $$
declare t text;
begin
  foreach t in array array['survey_responses', 'recovery_cases']
  loop
    execute format(
      'alter policy %I on reputation.%I
         using (
           core.is_agency() or core.is_assigned(client_id)
           or (client_id = core.current_client_id()
               and (core.visible_location_ids() is null
                    or location_id = any (core.visible_location_ids())))
         )',
      t || '_scope', t);
  end loop;
end $$;
