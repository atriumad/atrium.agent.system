---
sidebar_position: 4
title: "Events and contracts"
description: "How modules communicate and the event catalog."
---

# Events and *contracts*

Modules communicate only through events. An event is a past fact: immutable and versioned.

## Bus rules

1. **Transactional.** The event is enqueued in pg-boss inside the same transaction as the state change: if the review is stored, the event exists; if the transaction fails, it does not.
2. **Retries.** The worker delivers with exponential retries; after 5 failures the job is flagged for review and alerts in Sentry.
3. **Idempotency.** Each consumer stores the processed `id`s: receiving an event twice does not produce two effects.
4. **No personal data.** Events carry ids, never email or phone. The consumer asks Core for the contact, which verifies consent.
5. **Optional.** A consumer switched off for a client ignores the event.

## Shape of an event

```ts title="packages/contracts/src/events/review.ts"
import {z} from 'zod';

export const ReviewReceivedV1 = z.object({
  type: z.literal('review.received'),
  version: z.literal(1),
  id: z.string().uuid(),            // idempotency key
  occurredAt: z.string().datetime(),
  clientId: z.string().uuid(),
  locationId: z.string().uuid(),
  data: z.object({
    reviewId: z.string().uuid(),
    platform: z.enum(['google', 'yelp', 'other']),
    rating: z.number().int().min(1).max(5),
    guestId: z.string().uuid().optional(), // only when linked by survey or by the AM
  }),
});
export type ReviewReceivedV1 = z.infer<typeof ReviewReceivedV1>;
```

## Event catalog

| Event | Publishes | Expected consumers |
| --- | --- | --- |
| `guest.identified` | Core | CRM, Growth (Ledger) |
| `consent.changed` | Core | CRM, notifications |
| `guest.erased` | Core | Every module that stores a `guest_id`: scrub and confirm |
| `package.changed` | Core | Feature flags, Platform, Mobile, Manager |
| `signals.ingested` | signals | Rollup job |
| `metrics.rebuilt` | signals | Scoring, Platform |
| `score.computed` | signals | Maître (Scorekeeper), Platform, Mobile |
| `benchmark.updated` | signals | Scoring |
| `grade.written` | signals | Scoring |
| `listing.drift.detected` | discoverability | Concierge (Front Door, Listings), Scorekeeper |
| `hub.button.updated` | discoverability | Schema, Platform |
| `review.received` | reputation | Echo, Sentiment, Scorekeeper |
| `review.replied` | reputation | Scorekeeper |
| `survey.sent` | reputation | Scorekeeper |
| `survey.response.submitted` | reputation | Recovery, Memory, Ask |
| `recovery.case.opened` | reputation | Notifications (owner and AM alert) |
| `recovery.case.resolved` | reputation | Scorekeeper |
| `review.link.clicked` | reputation | Scorekeeper |
| `contact.captured` | crm | Memory, Flows |
| `automation.fired` | crm | Scorekeeper |
| `campaign.sent` | crm | Ledger, Scorekeeper |
| `loyalty.milestone.reached` | crm | Crown |
| `content.status.changed` | content | Manager, Platform |
| `content.approved` | content | Distribution, Manager |
| `content.published` | content | Pulse, elements registry |
| `task.fired` | ops | Manager |
| `task.completed` | ops | Manager, cycle progress |
| `cycle.started` | ops | Manager |
| `campaign.launched` | growth | Pacer, Ledger |
| `budget.pacing.alert` | growth | Maître, Manager |
| `offer.redeemed` | growth | Ledger |
| `order.attributed` | growth | Scorekeeper, Platform |
| `report.generated` | reports | Narrator, Manager |
| `report.sent` | reports | Archive |

## How to change a contract

- Add an optional field: same version.
- Remove, rename or change the type of a field: **new version** (`V2`). The producer publishes both versions until all consumers migrate.
- Every event has one valid and one invalid example in its contract tests.
