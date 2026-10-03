-- Core · identity: Better Auth tables (users, sessions, organizations, members, invitations).
-- Atrium is one organization; each client is another, linked by core.clients.organization_id.
-- These tables have no RLS: they are reached only by the auth layer, before any scope exists.
-- Everything a request does after login goes through withTenant / withAgency.

create table core.users (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.sessions (
  id text primary key,
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id text not null references core.users (id) on delete cascade,
  active_organization_id text
);
create index sessions_user_id_idx on core.sessions (user_id);

create table core.accounts (
  id text primary key,
  account_id text not null,
  provider_id text not null,
  user_id text not null references core.users (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_user_id_idx on core.accounts (user_id);

create table core.verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verifications_identifier_idx on core.verifications (identifier);

create table core.organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  logo text,
  metadata text,
  created_at timestamptz not null default now()
);

create table core.members (
  id text primary key,
  organization_id text not null references core.organizations (id) on delete cascade,
  user_id text not null references core.users (id) on delete cascade,
  role text not null check (role in
    ('agency_admin', 'account_manager', 'agency_staff', 'client_owner', 'client_staff')),
  team_role text check (team_role in
    ('account_manager', 'assistant_account_manager', 'creative_director',
     'assistant_creative_director', 'developer', 'graphic_designer', 'video_editor')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index members_user_id_idx on core.members (user_id);

create table core.invitations (
  id text primary key,
  organization_id text not null references core.organizations (id) on delete cascade,
  email text not null,
  role text,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  inviter_id text not null references core.users (id) on delete cascade
);
create index invitations_organization_id_idx on core.invitations (organization_id);

-- A client is held by one organization.
alter table core.clients
  add column organization_id text unique references core.organizations (id) on delete set null;

-- Resolving a client org to its client id happens before any scope exists, so RLS would hide the
-- row. This function is the one narrow door: it answers only "which client is this org".
create function core.client_id_for_org(org_id text) returns uuid
  language sql stable security definer set search_path = core, pg_temp as
  $$ select id from core.clients where organization_id = org_id $$;
revoke all on function core.client_id_for_org(text) from public;
grant execute on function core.client_id_for_org(text) to atrium_app;

grant select, insert, update, delete on
  core.users, core.sessions, core.accounts, core.verifications,
  core.organizations, core.members, core.invitations to atrium_app;
