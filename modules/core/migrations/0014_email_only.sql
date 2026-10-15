-- Core · email is the only channel. SMS, its carrier registration and its consent source are gone.
-- There is no real client data yet, so rows of the old channel are deleted instead of converted.
delete from core.notifications where channel = 'sms';
delete from core.consents where channel = 'sms' or source = 'sms_stop';

alter table core.consents drop constraint consents_channel_check;
alter table core.consents add constraint consents_channel_check check (channel in ('email'));
alter table core.consents drop constraint consents_source_check;
alter table core.consents add constraint consents_source_check check (source in
  ('pos', 'wifi_portal', 'qr', 'checkout', 'survey', 'manual', 'import',
   'email_unsubscribe', 'email_bounce', 'email_complaint'));

alter table core.notifications drop constraint notifications_channel_check;
alter table core.notifications add constraint notifications_channel_check check (channel in ('email'));

alter table core.client_packages drop column sms_registered;
