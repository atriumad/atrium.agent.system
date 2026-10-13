-- Reputation · a client owner asks the agency for a survey form or link. The agency fulfils or
-- dismisses it. Same row-level scope as the rest of the module.
create table reputation.survey_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null,
  requested_by text not null,
  requested_by_name text not null,
  note text,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'dismissed')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text,
  response text
);
create index survey_requests_status_idx on reputation.survey_requests (client_id, status, created_at);

alter table reputation.survey_requests enable row level security;
alter table reputation.survey_requests force row level security;
create policy survey_requests_scope on reputation.survey_requests
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
grant select, insert, update on reputation.survey_requests to atrium_app;
