-- Core · guests and consents.
-- One identity per client. Email and phone are stored normalized (the domain normalizes before
-- insert); uniqueness per client is what makes deduplication safe under concurrency.
-- The consent log is append-only: the app role can insert and read, never update or delete.
-- Erasure removes identifiers and the name but keeps the opaque guest row and the consent log
-- (ids only), so every foreign key and the proof of an opt-out survive.

create table core.guests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references core.clients (id) on delete cascade,
  name text,
  erased_at timestamptz,
  created_at timestamptz not null default now()
);
create index guests_client_id_idx on core.guests (client_id);

create table core.guest_identifiers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references core.clients (id) on delete cascade,
  guest_id uuid not null references core.guests (id) on delete cascade,
  kind text not null check (kind in ('email', 'phone')),
  value text not null check (length(value) > 0),
  created_at timestamptz not null default now(),
  unique (client_id, kind, value)
);
create index guest_identifiers_guest_id_idx on core.guest_identifiers (guest_id);

create table core.consents (
  seq bigint generated always as identity primary key,
  client_id uuid not null references core.clients (id) on delete cascade,
  guest_id uuid not null references core.guests (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null check (purpose in ('transactional', 'marketing')),
  granted boolean not null,
  source text not null check (source in
    ('pos', 'wifi_portal', 'qr', 'checkout', 'survey', 'manual', 'import',
     'email_unsubscribe', 'sms_stop')),
  recorded_at timestamptz not null default now()
);
create index consents_guest_idx on core.consents (guest_id, channel, purpose, seq);

alter table core.guests enable row level security;
alter table core.guests force row level security;
alter table core.guest_identifiers enable row level security;
alter table core.guest_identifiers force row level security;
alter table core.consents enable row level security;
alter table core.consents force row level security;

create policy guests_scope on core.guests
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());
create policy guest_identifiers_scope on core.guest_identifiers
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());
create policy consents_scope on core.consents
  using (core.is_agency() or client_id = core.current_client_id())
  with check (core.is_agency() or client_id = core.current_client_id());

grant select, insert, update on core.guests to atrium_app;
grant select, insert, delete on core.guest_identifiers to atrium_app;
grant select, insert on core.consents to atrium_app;
