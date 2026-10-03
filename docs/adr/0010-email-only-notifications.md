---
id: 0010-email-only-notifications
sidebar_position: 11
title: "0010 · Email-only notifications in the MVP"
sidebar_label: "0010 · Email-only notifications in the MVP"
description: "Email-only notifications in the MVP"
---

# ADR 0010: Email-only notifications in the MVP

| Status | Date | Deciders |
| --- | --- | --- |
| **Superseded by 0017** | 2026-10-01 | Atrium · product and technology |

:::note
Superseded. Email and SMS marketing, automations and tracked revenue windows are services Atrium sells, so messaging is part of the system. See [0017](./0017-twilio-email-and-sms).
:::

## Context

In the first scope, communication was limited to notices to the client and the guest. SMS requires registering each restaurant as a 10DLC brand, with a cost and a 1–4 week wait.

## Decision

A simple notifications module in Core with Resend and React Email. No campaigns or SMS. Every send verifies consent.

## Consequences

- Launch without external paperwork.
- SMS and campaigns would be added later.

## Discarded alternatives

- Twilio or Telnyx from the start: per-client paperwork with no real need at that scope.
