-- Core · a business asks for access. Nothing is created until the agency approves.
create table core.onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(trim(business_name)) between 1 and 120),
  owner_name text not null check (length(trim(owner_name)) between 1 and 120),
  owner_email text not null,
  first_location_name text not null check (length(trim(first_location_name)) between 1 and 120),
  first_location_time_zone text not null,
  note text check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text,
  reason text,
  client_id uuid references core.clients (id) on delete set null
);
create unique index onboarding_open_email_idx
  on core.onboarding_requests (lower(owner_email)) where status = 'open';

alter table core.onboarding_requests enable row level security;
alter table core.onboarding_requests force row level security;
create policy onboarding_requests_scope on core.onboarding_requests
  using (core.is_agency()) with check (core.is_agency());
grant select, update, delete on core.onboarding_requests to atrium_app;

-- The public form has no scope; this is the only way in, and it only inserts.
create function core.submit_onboarding_request(
  p_business text, p_owner text, p_email text, p_location text, p_tz text, p_note text
) returns void language sql security definer set search_path = core, pg_temp as $$
  insert into core.onboarding_requests
    (business_name, owner_name, owner_email, first_location_name, first_location_time_zone, note)
  values (trim(p_business), trim(p_owner), lower(trim(p_email)), trim(p_location), p_tz, nullif(trim(p_note), ''))
  on conflict do nothing $$;
revoke all on function core.submit_onboarding_request(text, text, text, text, text, text) from public;
grant execute on function core.submit_onboarding_request(text, text, text, text, text, text) to atrium_app;
