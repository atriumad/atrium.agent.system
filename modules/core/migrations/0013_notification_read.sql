-- Core · a person can mark the notifications addressed to them as read. Only that column is
-- writable, and the application narrows every update to the caller's own rows.
alter table core.notifications add column read_at timestamptz;
create index notifications_recipient_idx
  on core.notifications (recipient_id, created_at desc) where recipient_type = 'user';
grant update (read_at) on core.notifications to atrium_app;
