-- Core · a guest can opt in through a loyalty card. The check keeps every existing source and
-- adds loyalty_card. It only widens the list, so no existing row can violate it.
alter table core.consents drop constraint consents_source_check;
alter table core.consents add constraint consents_source_check check (source in
  ('pos', 'wifi_portal', 'qr', 'checkout', 'survey', 'manual', 'import',
   'email_unsubscribe', 'email_bounce', 'email_complaint', 'loyalty_card'));
