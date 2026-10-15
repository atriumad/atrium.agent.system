---
id: 0014-n8n-connectors-with-ingestion-api
sidebar_position: 15
title: "0014 · N8N connectors that call an ingestion API"
sidebar_label: "0014 · N8N connectors that call an ingestion API"
description: "N8N connectors that call an ingestion API"
---

# ADR 0014: N8N connectors that call an ingestion API

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Each provider (Toast, Metricool, Resend, Google, Meta) has its own API, cadence and quirks, and they change. The prototypes assume N8N feeding Supabase. Writing every connector as application code is slow; letting workflows write to the database skips validation and tenant isolation.

## Decision

Connectors are N8N workflows, exported to `connectors/` in the repo. They never write to the database: they call a validated, idempotent ingestion API in `apps/api` with a token scoped per connector. First-party sources (hub, survey flow) call the same API. A manual daily entry uses it too, with `source = manual`.

## Consequences

- Fast to build and to change per provider, with a visual trace of each run.
- Validation, deduplication and isolation live in one place and are tested.
- Every source, including manual, takes the same path.
- N8N is one more process to run and secure.

## Discarded alternatives

- Custom connectors in the worker: more control, slower to build.
- N8N writing directly to Supabase: skips validation and RLS.
- A hosted automation service: per-run cost and no control of credentials.
