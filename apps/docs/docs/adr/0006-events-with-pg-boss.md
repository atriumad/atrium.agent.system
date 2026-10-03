---
id: 0006-events-with-pg-boss
sidebar_position: 7
title: "0006 · Transactional events and jobs with pg-boss"
sidebar_label: "0006 · Transactional events and jobs with pg-boss"
description: "Transactional events and jobs with pg-boss"
---

# ADR 0006: Transactional events and jobs with pg-boss

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Modules communicate through events. An event cannot be lost if the change happened, nor exist if the change failed. Rollups, scoring, report generation and sends are scheduled jobs.

## Decision

pg-boss as a queue in the same Postgres. Events are enqueued inside the change's transaction. A worker (`apps/worker`) delivers with exponential retries and runs the scheduled jobs; consumers are idempotent.

## Consequences

- Transactional guarantee without a separate outbox pattern.
- No additional provider.
- The worker needs an always-on process (Railway).

## Discarded alternatives

- QStash or Inngest: another provider and no shared transaction.
- Redis/BullMQ: another database to operate.
