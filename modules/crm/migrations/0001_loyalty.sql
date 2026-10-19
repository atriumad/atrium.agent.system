-- CRM · the loyalty card: programs, anonymous cards, an append-only event log and rewards.
-- Docs: modules / CRM, docs/superpowers/specs/2026-10-19-crm-loyalty-qr-card-design.md.
--
-- No personal data lives here. A card holds ids and hashes; the optional guest link points into
-- Core's guest tables, where the email and its consent live. A card's progress is derived from
-- the events, nothing stores a running count.

create schema if not exists crm;
grant usage on schema crm to atrium_app;

create table crm.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null unique,
  name text not null check (length(name) between 1 and 120),
  stamps_required integer not null default 8 check (stamps_required between 2 and 20),
  reward_label text not null check (length(reward_label) between 1 and 80),
  cooldown_minutes integer not null default 240 check (cooldown_minutes between 0 and 1440),
  active boolean not null default true,
  -- bumping it invalidates every printed join QR for the program
  join_qr_version integer not null default 1 check (join_qr_version >= 1),
  -- an accent from the product's closed palette; there is no logo in v1
  accent text not null default 'lime' check (accent in ('lime', 'clay', 'charcoal', 'sage')),
  updated_at timestamptz not null default now(),
  -- the target of the composite keys below: a child cannot name a parent of another client
  unique (id, client_id, location_id),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index loyalty_programs_client_idx on crm.loyalty_programs (client_id);

create table crm.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null,
  program_id uuid not null,
  -- sha-256 hex of a random 128-bit token; the plaintext is never stored
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  short_code text not null check (short_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
  guest_id uuid,
  device_hash text,
  created_at timestamptz not null default now(),
  last_stamp_at timestamptz,
  closed_at timestamptz,
  unique (location_id, short_code),
  unique (id, client_id, location_id),
  -- foreign-key checks bypass row-level security, so the tenant columns are part of the key
  foreign key (program_id, client_id, location_id)
    references crm.loyalty_programs (id, client_id, location_id) on delete cascade,
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index loyalty_cards_program_idx on crm.loyalty_cards (program_id, created_at desc);
create index loyalty_cards_client_idx on crm.loyalty_cards (client_id, created_at desc);
create index loyalty_cards_guest_idx on crm.loyalty_cards (guest_id) where guest_id is not null;
create index loyalty_cards_device_idx on crm.loyalty_cards (program_id, device_hash, created_at)
  where device_hash is not null;

create table crm.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  location_id uuid not null,
  card_id uuid not null,
  earned_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by text,
  check (redeemed_by is null or redeemed_at is not null),
  unique (id, card_id),
  foreign key (card_id, client_id, location_id)
    references crm.loyalty_cards (id, client_id, location_id) on delete cascade,
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index loyalty_rewards_card_idx on crm.loyalty_rewards (card_id, earned_at);
create index loyalty_rewards_client_idx on crm.loyalty_rewards (client_id, earned_at desc);

-- Append-only. client_id and location_id are copied from the card by the use case (the policy and
-- the foreign key need them); there are no triggers.
create table crm.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  -- monotonic: the order of events with the same created_at (progress orders by (at, seq))
  seq bigint generated always as identity,
  client_id uuid not null,
  location_id uuid not null,
  card_id uuid not null,
  kind text not null check (kind in ('stamp', 'reward_earned', 'reward_redeemed', 'void')),
  -- the staff user; null for the system
  actor_id text,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  -- a void points at the stamp it cancels
  voids_id uuid,
  -- a reward_redeemed event names the reward it redeemed
  reward_id uuid,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (card_id, idempotency_key),
  unique (id, card_id),
  foreign key (card_id, client_id, location_id)
    references crm.loyalty_cards (id, client_id, location_id) on delete cascade,
  -- a void can only cancel an event of its own card
  foreign key (voids_id, card_id) references crm.loyalty_events (id, card_id),
  -- and only a reward of its own card (MATCH SIMPLE: null is allowed)
  foreign key (reward_id, card_id) references crm.loyalty_rewards (id, card_id),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade
);
create index loyalty_events_card_idx on crm.loyalty_events (card_id, created_at, seq);
create index loyalty_events_client_idx on crm.loyalty_events (client_id, created_at desc);

-- Rate-limit counters. Not tenant data (keys are opaque hashes and ids, no client_id), and not
-- reachable by atrium_app at all: no grant, only crm.hit_rate (security definer) touches it.
create table crm.rate_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index rate_counters_window_idx on crm.rate_counters (window_start);

-- A public link carries only a token. Finding its card has to happen before any scope exists, so
-- these functions answer exactly that. Exact match only: no listing, no prefix, no pattern.
create function crm.card_scope(hash text)
  returns table (card_id uuid, client_id uuid, location_id uuid, program_id uuid)
  language sql stable security definer set search_path = crm, pg_temp as $$
  select c.id, c.client_id, c.location_id, c.program_id
    from crm.loyalty_cards c where c.token_hash = card_scope.hash $$;
revoke all on function crm.card_scope(text) from public;
grant execute on function crm.card_scope(text) to atrium_app;

create function crm.program_scope(program uuid)
  returns table (client_id uuid, location_id uuid, active boolean, join_qr_version integer)
  language sql stable security definer set search_path = crm, pg_temp as $$
  select p.client_id, p.location_id, p.active, p.join_qr_version
    from crm.loyalty_programs p where p.id = program_scope.program $$;
revoke all on function crm.program_scope(uuid) from public;
grant execute on function crm.program_scope(uuid) to atrium_app;

-- Counts one hit in a window and says whether it is still within the limit.
create function crm.hit_rate(rate_key text, window_start timestamptz, lim integer)
  returns boolean
  language plpgsql volatile security definer set search_path = crm, pg_temp as $$
#variable_conflict use_variable
declare
  n integer;
begin
  if rate_key is null or length(rate_key) < 1 or length(rate_key) > 200 then
    raise exception 'hit_rate: the rate key must be 1 to 200 characters';
  end if;
  if window_start is null then
    raise exception 'hit_rate: the window start is required';
  end if;
  -- a client-chosen far-off window would plant counters the purge never reaches in time
  if abs(extract(epoch from (window_start - now()))) > 86400 then
    raise exception 'hit_rate: the window start must be within a day of now';
  end if;
  if lim is null or lim < 1 or lim > 100000 then
    raise exception 'hit_rate: the limit must be between 1 and 100000';
  end if;

  insert into crm.rate_counters as rc (key, window_start, count)
    values (rate_key, window_start, 1)
    on conflict on constraint rate_counters_pkey do update set count = rc.count + 1
    returning rc.count into n;

  -- about one call in fifty clears counters older than a day
  if random() < 0.02 then
    delete from crm.rate_counters d where d.window_start < now() - interval '1 day';
  end if;

  return n <= lim;
end $$;
revoke all on function crm.hit_rate(text, timestamptz, integer) from public;
grant execute on function crm.hit_rate(text, timestamptz, integer) to atrium_app;

-- Row-level security: the client scope AND the location predicate, in one policy from the start.
do $$
declare t text;
begin
  foreach t in array array['loyalty_programs', 'loyalty_cards', 'loyalty_events', 'loyalty_rewards']
  loop
    execute format('alter table crm.%I enable row level security', t);
    execute format('alter table crm.%I force row level security', t);
    execute format(
      'create policy %I on crm.%I
         using (
           core.is_agency() or core.is_assigned(client_id)
           or (client_id = core.current_client_id()
               and (core.visible_location_ids() is null
                    or location_id = any (core.visible_location_ids())))
         )
         with check (
           core.is_agency() or core.is_assigned(client_id)
           or (client_id = core.current_client_id()
               and (core.visible_location_ids() is null
                    or location_id = any (core.visible_location_ids())))
         )',
      t || '_scope', t);
  end loop;
end $$;

grant select, insert, update on crm.loyalty_programs, crm.loyalty_cards, crm.loyalty_rewards to atrium_app;
-- nothing updates or deletes an event
grant select, insert on crm.loyalty_events to atrium_app;
