-- Reputation · what the agent read in a guest's words. Labels only, never a copy of the text.
-- All nullable: a row with read_at null is unread, and then every label is null too.
alter table reputation.survey_responses
  add column sentiment text check (sentiment in ('positive', 'mixed', 'negative')),
  add column topics text[] check (
    topics is null or (
      cardinality(topics) <= 3
      and topics <@ array['food', 'service', 'wait', 'cleanliness', 'price', 'atmosphere', 'staff', 'other']::text[]
    )
  ),
  add column concern text check (concern in ('none', 'low', 'medium', 'high')),
  add column safety boolean,
  add column read_at timestamptz,
  add column read_model text,
  add constraint survey_responses_read_complete check (
    (read_at is null) = (
      sentiment is null and topics is null and concern is null and safety is null and read_model is null
    )
  );
