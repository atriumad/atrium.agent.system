---
id: 0008-own-data
sidebar_position: 9
title: "0008 · Own data before integrations"
sidebar_label: "0008 · Own data before integrations"
description: "Own data before integrations"
---

# ADR 0008: Own data before integrations

| Status | Date | Deciders |
| --- | --- | --- |
| **Superseded by 0013 and 0014** | 2026-10-01 | Atrium · product and technology |

:::note
Superseded. The source material shows that the system exists to read Toast, Metricool, Resend, Google and the ads platforms. The model is now a signal chain with connectors ([0013](./0013-signals-data-model), [0014](./0014-n8n-connectors-with-ingestion-api)), with a manual fallback and the Toast nightly export as the first route, which keeps the part of this decision that mattered: no number depends on one provider's approval.
:::

## Context

The standard Toast API is read-only and does not deliver diner data on dine-in orders; the partner program takes months. Reservation platforms have no public write API.

## Decision

The system generated its own data first (reservations, surveys, QR, walk-ins, clicks) and left POS integrations for later.

## Consequences

- No dependence on third-party approvals to launch.
- Revenue metrics depended on the client importing sales.

## Discarded alternatives

- Toast partner from the start: months of waiting before delivering value.
