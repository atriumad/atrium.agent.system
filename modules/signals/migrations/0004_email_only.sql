-- Signals · SMS deliveries are not a signal any more. Dropping the check on the partitioned parent
-- drops it on every partition; adding it back validates every partition.
delete from signals.signals_daily where signal_type = 'sms_delivered';
alter table signals.signals_daily drop constraint signals_daily_signal_type_check;
alter table signals.signals_daily add constraint signals_daily_signal_type_check check (signal_type in (
  'impression', 'reach_account', 'video_view', 'follower_add', 'discovery_search', 'engagement', 'save',
  'profile_visit', 'session', 'menu_view', 'link_click', 'email_open', 'email_click', 'direct_search',
  'direction', 'call', 'order_click', 'reserve_click', 'rsvp', 'qr_scan', 'order', 'reservation',
  'redemption', 'lead', 'loyalty_signup', 'repeat_visit', 'winback_visit', 'revenue', 'review',
  'review_reply', 'survey_score', 'rating_point', 'rank_point', 'opt_in', 'opt_out', 'spend',
  'agent_grade'));

-- The SMS provider was a signal source too.
delete from signals.signals_daily where source = 'twilio';
alter table signals.signals_daily drop constraint signals_daily_source_check;
alter table signals.signals_daily add constraint signals_daily_source_check check (source in (
  'metricool', 'gbp', 'landing', 'site', 'toast', 'meta_ads', 'google_ads', 'survey', 'review',
  'manual', 'agent'));
