-- Core · delivery tracking. The provider's message id lets a webhook find the row again, and the
-- status follows the message from sent to delivered, bounced or complained.
alter table core.notifications add column provider_id text;
create unique index notifications_provider_id_idx
  on core.notifications (provider_id) where provider_id is not null;
alter table core.notifications drop constraint notifications_status_check;
alter table core.notifications add constraint notifications_status_check
  check (status in ('recorded', 'sent', 'failed', 'delivered', 'bounced', 'complained'));
-- The webhook moves the status forward; nothing else about a sent message changes.
grant update (status) on core.notifications to atrium_app;
