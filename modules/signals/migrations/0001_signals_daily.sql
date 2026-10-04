-- Signals · signals_daily, the atom. Docs: data / Storage and pipeline.
--
-- One row per signal per day, partitioned by month. The natural key makes ingestion idempotent:
-- a re-run replaces the day. NULLS NOT DISTINCT so that "no platform" and "no element" are
-- values of the key, not wildcards.
--
-- The app role is granted the parent table only. Partitions belong to the owner role, so a direct
-- query against a partition (which would skip the parent's row-level policies) is refused.

create schema if not exists signals;
grant usage on schema signals to atrium_app;

create table signals.signals_daily (
  client_id uuid not null,
  location_id uuid not null,
  date date not null,
  source text not null check (source in ('metricool', 'gbp', 'landing', 'site', 'toast', 'twilio', 'meta_ads', 'google_ads', 'survey', 'review', 'manual', 'agent')),
  platform text check (platform in ('instagram', 'facebook', 'tiktok', 'youtube', 'google', 'meta')),
  element_id text check (element_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  signal_type text not null check (signal_type in (
    'impression', 'reach_account', 'video_view', 'follower_add', 'discovery_search', 'engagement', 'save', 'profile_visit', 'session', 'menu_view', 'link_click', 'email_open', 'email_click', 'direct_search', 'direction', 'call', 'order_click', 'reserve_click', 'rsvp', 'qr_scan', 'order', 'reservation', 'redemption', 'lead', 'loyalty_signup', 'repeat_visit', 'winback_visit', 'revenue', 'review', 'review_reply', 'survey_score', 'rating_point', 'rank_point', 'sms_delivered', 'opt_in', 'opt_out', 'spend', 'agent_grade')),
  value numeric(20, 4) not null check (value >= 0),
  meta jsonb,
  guest_id uuid,
  ingested_at timestamptz not null default now(),
  foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade,
  unique nulls not distinct (date, location_id, source, platform, element_id, signal_type)
) partition by range (date);

create index signals_daily_location_idx on signals.signals_daily (client_id, location_id, date);
create index signals_daily_type_idx on signals.signals_daily (client_id, signal_type, date);
create index signals_daily_element_idx on signals.signals_daily (client_id, element_id, date)
  where element_id is not null;
-- guest.erased scrubs by guest id
create index signals_daily_guest_idx on signals.signals_daily (guest_id) where guest_id is not null;

-- Creates the month's partition on demand. A security definer function so the app role never
-- owns DDL rights, with a window so a bad date cannot create thousands of tables.
create function signals.ensure_partition(day date) returns void
  language plpgsql security definer set search_path = signals, pg_temp as $$
declare
  first_day date := date_trunc('month', day)::date;
  next_month date := (date_trunc('month', day) + interval '1 month')::date;
  part text := format('signals_daily_%s', to_char(first_day, 'YYYY_MM'));
begin
  if day < date '2020-01-01' or day > current_date + 400 then
    raise exception 'signal date out of range: %', day;
  end if;
  perform pg_advisory_xact_lock(hashtext('signals.ensure_partition'));
  if to_regclass(format('signals.%I', part)) is null then
    execute format(
      'create table signals.%I partition of signals.signals_daily for values from (%L) to (%L)',
      part, first_day, next_month);
  end if;
end $$;

revoke all on function signals.ensure_partition(date) from public;
grant execute on function signals.ensure_partition(date) to atrium_app;

-- Backfill room: from January 2025 to September 2027, inside the function's window on any run
-- date. Later months are created on demand by ingestion.
select signals.ensure_partition((date '2025-01-01' + (n || ' month')::interval)::date)
from generate_series(0, 32) as n;

alter table signals.signals_daily enable row level security;
alter table signals.signals_daily force row level security;

create policy signals_daily_scope on signals.signals_daily
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());

-- No delete: history is only replaced by a re-run. Retention is the owner role's job.
grant select, insert, update on signals.signals_daily to atrium_app;
