---
id: 0005-postgres-and-drizzle
sidebar_position: 6
title: "0005 · PostgreSQL with Drizzle and one schema per module"
sidebar_label: "0005 · PostgreSQL with Drizzle and one schema per module"
description: "PostgreSQL with Drizzle and one schema per module"
---

# ADR 0005: PostgreSQL with Drizzle and one schema per module

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Every module needs isolation per client and independent migrations; the signals tables grow daily and are read over arbitrary date ranges.

## Decision

PostgreSQL managed on Supabase. One schema per module. Drizzle ORM with versioned SQL migrations inside each module. `signals_daily` partitioned by month. Repositories that require `clientId` and RLS as a second defense.

## Consequences

- Transactions for events and approvals.
- Types generated from the schema.
- Range math over daily rows stays a plain indexed query.
- Supabase is used as managed Postgres; auth does not depend on it.

## Discarded alternatives

- Prisma: heavier and with less control over SQL.
- Neon: valid; Supabase was chosen for the team's familiarity.
- A separate analytics warehouse: not needed at this volume; revisit if rollups exceed their budget.
