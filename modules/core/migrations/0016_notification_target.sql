-- Core · what a notification is about. The panel uses it to open the case, the place or the help
-- request that caused the notification, not just the list it lives in. Both columns are empty on
-- older rows and on messages that point at nothing.
alter table core.notifications add column target_type text;
alter table core.notifications add column target_id text;
alter table core.notifications add constraint notifications_target_check
  check (
    (target_type is null) = (target_id is null)
    and (target_type is null or target_type in ('case', 'location', 'help_request'))
  );
