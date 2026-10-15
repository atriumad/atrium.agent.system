-- Reputation · an invitation is sent by email or handed over by a person. SMS is gone.
update reputation.survey_invitations set channel = null where channel = 'sms';
alter table reputation.survey_invitations drop constraint survey_invitations_channel_check;
alter table reputation.survey_invitations
  add constraint survey_invitations_channel_check check (channel in ('email', 'manual'));
