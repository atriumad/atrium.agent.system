---
sidebar_position: 2
title: "Glossary"
description: "Canonical names for code, sales and reports."
---

# *Canonical* glossary

One name per concept. English for code and sales; Spanish equivalents are for internal use. Retired names are no longer used.

## Business

| Term | Code key | What it is | Replaces |
| --- | --- | --- | --- |
| Growth System | `growth_system` | The complete system: 5 engines, one score | Restaurant Marketing System |
| Engine | `engine` | Unit that answers one question about the restaurant. There are exactly 5 | Pillar (as a name for an engine) |
| Discoverability | `discoverability` | Engine 01. Get found: how well set up are you? | — |
| Acquisition | `acquisition` | Engine 02. Get seen: how much of the city sees you? | Attention, Penetration |
| Reputation | `reputation` | Engine 03. Get chosen: do they choose you? | Trust |
| Retention | `retention` | Engine 04. Bring them back: do they come back? | Retain (as an engine) |
| Growth | `growth` | Engine 05. Tracked revenue: what are the ads and campaigns producing? | Growth Intelligence (layer) |
| Tier | `tier` | Service grouping by commercial intent: Discover, Retain, Growth. Not an engine | — |
| Package | `package` | What a client buys and what the platform unlocks: Essential, Pillar 2, Pillar 3 | Plan |
| Service | `service` | Sellable, deliverable unit. Belongs to a single engine | — |
| Moment | `moment` | One of the 10 discovery moments | Trigger |
| Archetype | `archetype` | One of the 5 customer journey types | Persona |
| Stage | `journey_stage` | Stranger, Discovery, Consideration, First Visit, Loyal Regular | — |
| Funnel stage | `funnel_stage` | awareness, consideration, buying_intent, outcome or none. How a metric is bucketed | — |
| Client | `client` | The business that hires Atrium (the restaurant) | Organization, brand |
| Location | `location` | A client's physical venue | Restaurant GUID |
| Guest | `guest` | The restaurant's diner | Customer, crm_customer |

## Data

| Term | Code key | What it is | Replaces |
| --- | --- | --- | --- |
| Signal | `signal` | One counted thing on one day: an impression, a tap, an order. The atom | Metric (when a platform says it) |
| Element | `element` | An individual piece that carries its own signals: a reel, an email, an ad, an offer, a hub button | Asset |
| Metric | `metric` | Signals calculated over a period (sum, avg, rate, latest) | KPI |
| Benchmark | `benchmark` | Monthly average of restaurants within a 10-mile radius, per metric | Competitor average |
| Measured score | `measured` | Half of an engine score: metrics against the benchmark | Quantitative |
| Practice grade | `practice` | The other half: criteria no API reports, graded 0–4 by agents | Qualitative |
| Engine score | `engine_score` | 0–100 per engine: 60% measured + 40% practice | Grade, score |
| Growth Score | `growth_score` | 0–300: the five engine scores weighted equally | Health score |

## Product and operations

| Term | Code key | What it is | Replaces |
| --- | --- | --- | --- |
| Platform | `platform` | The client's web dashboard (Growth OS) | Dashboard v4 |
| Manager | `manager` | The agency's web app (Agency OS) | Admin |
| Mobile | `mobile` | The owner's app | — |
| Hub | `hub` | The restaurant's landing page: one link everywhere, plus the first-party source of record | Linktree |
| COG | `cog` | Client Operational Guidelines: the promise, priced in measurable units | Scope doc |
| Cycle | `cycle` | The monthly delivery rhythm anchored to the billing date | Sprint |
| Account Manager (AM) | `account_manager` | Owns the client relationship, fires the tasks, approves | — |

## Agents and code

| Term | Code key | What it is | Replaces |
| --- | --- | --- | --- |
| Agent | `agent` | Main agent of an engine (Concierge, Herald, Host, Sommelier, Steward) or the orchestrator (Maître) | — |
| Subagent | `subagent` | Specialist inside an agent, with its own manifest | Bot |
| Module | `module` | Unit of code with its own schema, API, events and MCP tools | Service (technical) |

:::tip Convention
"Client" is always the restaurant and "guest" is always the diner. Never the other way around, never "customer". "Host" is the agent; the person who seats guests is "restaurant staff".
:::
