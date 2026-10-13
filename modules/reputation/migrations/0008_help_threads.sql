-- Reputation · a help request is a conversation. Docs: modules / Reputation (Help requests).
-- Messages belong to a request and to its client; the pair is a composite foreign key, so a
-- message can never sit under another client's request.
alter table reputation.survey_requests
  add constraint survey_requests_id_client_key unique (id, client_id),
  add column last_message_at timestamptz,
  add column last_author_side text check (last_author_side in ('client', 'agency')),
  add column last_preview text;

create table reputation.survey_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  client_id uuid not null,
  author_id text not null,
  author_name text not null,
  side text not null check (side in ('client', 'agency')),
  body text not null check (char_length(body) between 1 and 2000),
  attachment jsonb check (
    attachment is null
    or (jsonb_typeof(attachment) = 'object' and attachment ->> 'kind' in ('response', 'review'))
  ),
  created_at timestamptz not null default now(),
  foreign key (request_id, client_id)
    references reputation.survey_requests (id, client_id) on delete cascade
);
create index survey_request_messages_thread_idx
  on reputation.survey_request_messages (request_id, created_at);

alter table reputation.survey_request_messages enable row level security;
alter table reputation.survey_request_messages force row level security;
create policy survey_request_messages_scope on reputation.survey_request_messages
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
grant select, insert on reputation.survey_request_messages to atrium_app;

-- backfill:
-- every request that has no messages yet becomes a thread. Idempotent.
insert into reputation.survey_request_messages
  (request_id, client_id, author_id, author_name, side, body, created_at)
select r.id, r.client_id, r.requested_by, r.requested_by_name, 'client',
       coalesce(nullif(btrim(r.note), ''), '(no message)'), r.created_at
  from reputation.survey_requests r
 where not exists (select 1 from reputation.survey_request_messages m where m.request_id = r.id);

insert into reputation.survey_request_messages
  (request_id, client_id, author_id, author_name, side, body, created_at)
select r.id, r.client_id, coalesce(r.handled_by, 'atrium'), 'Atrium team', 'agency',
       btrim(r.response), coalesce(r.handled_at, r.created_at + interval '1 second')
  from reputation.survey_requests r
 where nullif(btrim(r.response), '') is not null
   and not exists (
     select 1 from reputation.survey_request_messages m
      where m.request_id = r.id and m.side = 'agency'
   );

update reputation.survey_requests r
   set last_message_at = m.created_at,
       last_author_side = m.side,
       last_preview = left(m.body, 140)
  from (
    select distinct on (request_id) request_id, created_at, side, body
      from reputation.survey_request_messages
     order by request_id, created_at desc
  ) m
 where m.request_id = r.id and r.last_message_at is null;
