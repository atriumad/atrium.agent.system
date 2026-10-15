---
id: 0021-resend-email-no-sms
sidebar_position: 22
title: "0021 · Resend for email, no SMS"
sidebar_label: "0021 · Resend for email, no SMS"
description: "Resend for email, no SMS"
---

# ADR 0021: Resend for email, no SMS

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-15 | Atrium · product and technology |

:::note
Supersedes [0017](./0017-twilio-email-and-sms).
:::

## Context

ADR 0017 chose Twilio for email and SMS, with a carrier registration per restaurant before SMS could go live. Atrium will not send SMS, and the provider for email is now Resend. The notification door already hides the provider behind a port.

## Decision

Email is the only channel. Resend sends it, through the existing `NotificationTransport` port. A signed webhook records delivery, bounces and complaints; a bounce or a complaint withdraws that guest's consent. The review request carries an unsubscribe link, and an unsubscribe withdraws consent. SMS, Twilio and the carrier registration are removed from the schema, the code and the documentation. A guest's phone remains a contact detail for the team to call; it is not a channel.

## Consequences

- One provider, one webhook model, one channel.
- Email opens and clicks are not tracked yet; they arrive with marketing and CRM.
- A bounce stops all email to that guest, including a later survey invitation.
- The migration deletes the old SMS rows. This is acceptable only because there is no real client data yet.
- The API and the agents service refuse to start outside development without the Resend variables.

## Discarded alternatives

- Keeping SMS in the schema for later: it leaves dead code and a promise the product does not keep.
- Sending through the provider's SDK: a plain request is enough and easier to test.
- Tracking opens in transactional email: it needs a decision with marketing first.
