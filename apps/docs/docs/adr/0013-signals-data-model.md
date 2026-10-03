---
id: 0013-signals-data-model
sidebar_position: 14
title: "0013 · Signals, metrics and scores in six tables"
sidebar_label: "0013 · Signals, metrics and scores in six tables"
description: "Signals, metrics and scores in six tables"
---

# ADR 0013: Signals, metrics and scores in six tables

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Every screen, every score and every agent needs the same numbers. Platforms name and count the same thing differently, and a dashboard built per source would disagree with itself. The prototypes already derive everything from one atomic row.

## Decision

One atom: a daily-stamped signal in `signals_daily`, optionally attributed to an element and a stitched guest. Metrics are built from signals (sum, avg, rate, latest) into `metrics_daily`; engine scores and the Growth Score are built from metrics and agent grades. Six tables: `signals_daily`, `metrics_daily`, `elements`, `benchmarks_monthly`, `agent_grades`, `scores_weekly`. A canonical `signal_type` enum and one name per metric. Every metric carries a unit, a formula, a funnel stage and an engine.

## Consequences

- A new source is a connector, not a new schema; agents and screens do not change.
- Any range (7, 30, 90 days, custom) is the same query; there are no pre-baked ranges.
- Rollups are rebuilt idempotently, so a formula fix repairs history.
- Daily grain is the finest resolution; nothing downstream needs finer.

## Discarded alternatives

- A table per source: every screen joins them and the vocabularies drift.
- Pre-aggregated dashboards: fast, but a change in a formula cannot be replayed.
- Event-level storage of every impression: volume with no use.
