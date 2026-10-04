-- Signals · connector tokens. Docs: ADR 0014.
-- A token belongs to one connector (an N8N workflow, the hub, the survey flow) and is scoped to
-- the sources it may write and the clients it serves. Only the SHA-256 of the token is stored.
-- Authentication happens before any scope exists, so it goes through one narrow function; the
-- table itself is readable and writable by agency scope only.

create table signals.connector_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  sources text[] not null check (cardinality(sources) > 0),
  client_ids uuid[] not null check (cardinality(client_ids) > 0),
  created_at timestamptz not null default now(),
  created_by text not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);

alter table signals.connector_tokens enable row level security;
alter table signals.connector_tokens force row level security;
create policy connector_tokens_agency on signals.connector_tokens for all
  using (core.is_agency()) with check (core.is_agency());

create function signals.authenticate_token(hash text)
  returns table (id uuid, name text, sources text[], client_ids uuid[])
  language sql security definer set search_path = signals, pg_temp as $$
  update signals.connector_tokens t set last_used_at = now()
  where t.token_hash = hash and t.revoked_at is null
  returning t.id, t.name, t.sources, t.client_ids $$;

revoke all on function signals.authenticate_token(text) from public;
grant execute on function signals.authenticate_token(text) to atrium_app;

grant select, insert, update on signals.connector_tokens to atrium_app;
