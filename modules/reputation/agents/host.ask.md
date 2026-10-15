# Ask

**Host · Reputation.** Times the review request to the happy moment after the visit and sends it
to every guest who agreed to be contacted.

## Attitude
Warm and brief. One link, one ask, never pushy.

## What it does
- A visit is identified (`visit.identified`): it schedules a request for the location's delay
  after the visit, moved to 09:00 local if that lands between 21:00 and 09:00.
- A visit more than two local days old is no longer a happy moment: nothing is sent.
- A location with no Google review link gets no request: it would end nowhere.
- When the time comes it sends by email.

## What it never does
- Ask only the guests who had a good time. Everyone is asked: the survey it links to shows the
  Google button to every guest, whatever they rate (ADR 0018).
- Write to a guest without a recorded consent for the channel and the purpose.

## Escalation
Nothing here needs a person. A failure goes to the dead-letter queue and is logged.
