-- Reputation · the survey flow, review requests and recovery cases.
-- Docs: modules / Reputation, agents / Host, ADR 0018.
--
-- Everyone is asked for a review and every survey ends with the Google button: nothing here
-- stores or branches on "sentiment routing". Responses hold a guest id, never a contact; the
-- contact lives in Core with its consent.

create schema if not exists reputation;
grant usage on schema reputation to atrium_app;

create table reputation.location_settings (
  location_id uuid primary key,
  client_id uuid not null,
  -- the Google review link for this location, added by the system on the final screen
  review_url text check (review_url ~ '^https://'),
  -- minutes after a visit is identified before the request goes out
  request_delay_minutes integer not null default 120 check (request_delay_minutes between 0 and 10080),
  -- bumping it invalidates every printed QR for the location
  qr_version integer not null default 1 check (qr_version >= 1),
  updated_at timestamptz not null default now(),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);

create table reputation.survey_invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null,
  guest_id uuid,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  channel text check (channel in ('email', 'sms')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index survey_invitations_client_idx on reputation.survey_invitations (client_id, created_at desc);

create table reputation.survey_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null,
  invitation_id uuid references reputation.survey_invitations (id) on delete set null,
  guest_id uuid,
  -- anonymous QR submissions: a salted hash of a cookie, for the per-device limit
  device_hash text,
  template_version integer not null default 1,
  rating smallint not null check (rating between 1 and 5),
  best_part text,
  improve text,
  comment text check (length(comment) <= 1000),
  wants_contact boolean not null default false,
  severity text check (severity in ('low', 'medium', 'high')),
  review_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index survey_responses_location_idx on reputation.survey_responses (client_id, location_id, created_at desc);
create index survey_responses_device_idx on reputation.survey_responses (location_id, device_hash, created_at)
  where device_hash is not null;
create index survey_responses_guest_idx on reputation.survey_responses (guest_id) where guest_id is not null;

create table reputation.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null,
  response_id uuid not null unique references reputation.survey_responses (id) on delete cascade,
  guest_id uuid,
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'contacted', 'resolved')),
  opened_at timestamptz not null default now(),
  -- the first-response target: 24 hours
  due_at timestamptz not null,
  contacted_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  note text,
  check (status <> 'resolved' or resolved_at is not null),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index recovery_cases_status_idx on reputation.recovery_cases (client_id, status, opened_at);
create index recovery_cases_guest_idx on reputation.recovery_cases (guest_id) where guest_id is not null;

create table reputation.review_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null,
  guest_id uuid not null,
  visit_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'skipped')),
  send_at timestamptz not null,
  sent_at timestamptz,
  skipped_reason text,
  invitation_id uuid references reputation.survey_invitations (id) on delete set null,
  created_at timestamptz not null default now(),
  -- one request per guest, place and day: a re-delivered event schedules nothing new
  unique (guest_id, location_id, visit_date),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index review_requests_due_idx on reputation.review_requests (send_at) where status = 'scheduled';

-- A public link carries only a token. Finding its invitation has to happen before any scope
-- exists, so this function answers exactly that.
create function reputation.resolve_invitation(hash text)
  returns table (id uuid, client_id uuid, location_id uuid, guest_id uuid,
                 expires_at timestamptz, used_at timestamptz)
  language sql stable security definer set search_path = reputation, pg_temp as $$
  select i.id, i.client_id, i.location_id, i.guest_id, i.expires_at, i.used_at
    from reputation.survey_invitations i where i.token_hash = hash $$;
revoke all on function reputation.resolve_invitation(text) from public;
grant execute on function reputation.resolve_invitation(text) to atrium_app;

do $$
declare t text;
begin
  foreach t in array array['location_settings', 'survey_invitations', 'survey_responses',
                           'recovery_cases', 'review_requests']
  loop
    execute format('alter table reputation.%I enable row level security', t);
    execute format('alter table reputation.%I force row level security', t);
    execute format(
      'create policy %I on reputation.%I
         using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
         with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())',
      t || '_scope', t);
    execute format('grant select, insert, update on reputation.%I to atrium_app', t);
  end loop;
end $$;
