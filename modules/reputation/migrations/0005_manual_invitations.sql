-- A link made by hand in the Manager has no channel of its own.
alter table reputation.survey_invitations drop constraint survey_invitations_channel_check;
alter table reputation.survey_invitations
  add constraint survey_invitations_channel_check check (channel in ('email', 'sms', 'manual'));
