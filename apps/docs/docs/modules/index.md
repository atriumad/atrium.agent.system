---
sidebar_position: 1
title: "Modules"
description: "The system's modules and their status."
---

# System *modules*

Each module follows the [standard shape](../architecture/repository): pure domain, use cases, infrastructure, routes, event consumers and MCP tools.

| Module | Engine and agents | What it does | Phase | Status |
| --- | --- | --- | --- | --- |
| [Core](./core) | — | Auth, clients, locations, roles, packages, guests, consents, event queue, approvals, audit | F0 | To build |
| [Signals](./signals) | Maître | The ingestion API, signals, metrics, benchmarks, grades and scores | F0–F1 | To build |
| [Discoverability](./discoverability) | Concierge | Setup readiness, listings sync, the landing hub and site health | F2 | To build |
| [Content](./content) | Herald | Elements registry, content pipeline, calendar and approvals | F3 | To build |
| [Ops](./ops) | — | Tasks, the COG, cycles and daily entry | F3 | To build |
| [Reputation](./reputation) | Host | Reviews, replies, the survey flow, recovery cases | F2–F4 | To build |
| [CRM](./crm) | Sommelier | Guestbook, segments, automations, campaigns, loyalty | F4 | To build |
| [Growth](./growth) | Steward | Programs, offers, campaigns, attribution | F4 | To build |
| [Reports](./reports) | Maître | Report builder, narrative, archive | F6 | To build |
| [Booker](./booker) | Host | Own reservations by cover pacing | Deferred | Deferred |
