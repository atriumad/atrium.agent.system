---
id: 0017-twilio-email-and-sms
sidebar_position: 18
title: "0017 · Twilio for email and SMS"
sidebar_label: "0017 · Twilio for email and SMS"
description: "Twilio for email and SMS"
---

# ADR 0017: Twilio for email and SMS

| Status | Date | Deciders |
| --- | --- | --- |
| **Superseded by [0021](./0021-resend-email-no-sms)** | 2026-10-01 | Atrium · product and technology |

:::note
Supersedes [0010](./0010-email-only-notifications).
:::

## Context

Email and SMS marketing, automations and tracked revenue windows (14 days for email, 7 for SMS) are services Atrium sells. They need opens, clicks, deliveries and opt-outs as signals. SMS needs a 10DLC registration per restaurant.

## Decision

Twilio for every send, with webhooks written to `signals_daily`, React Email for templates, and a consent check on every send. 10DLC registration starts at onboarding; SMS goes live for a client only when its registration is approved.

## Consequences

- One provider and one webhook model for every send.
- Opt-outs update the consent log at once.
- SMS lead time (1–4 weeks) becomes an onboarding step.

## Discarded alternatives

- Resend for email plus a separate SMS provider: two models to track.
- A campaign platform: duplicates segments and automations that the CRM module owns.
