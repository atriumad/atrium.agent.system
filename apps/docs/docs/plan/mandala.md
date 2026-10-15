---
sidebar_position: 4
title: "9×9 Mandala"
description: "One goal, eight pillars, 64 tasks."
---

# One goal, eight pillars, *64 tasks*

The center is the goal: **the complete system, live for the whole portfolio on 30 April 2027**. Each pillar opens into eight tasks with its phase. The interactive board with shared progress lives in the Build Plan; this page is the reference.

| Pillar | Name | Tasks |
| --- | --- | --- |
| A | [Foundations and quality](#pillar-a) | 8 |
| B | [Core business](#pillar-b) | 8 |
| C | [Data backbone](#pillar-c) | 8 |
| D | [Connectors](#pillar-d) | 8 |
| E | [Platform](#pillar-e) | 8 |
| F | [Agency OS](#pillar-f) | 8 |
| G | [Agents and MCP](#pillar-g) | 8 |
| H | [Pilot, Mobile and launch](#pillar-h) | 8 |

## Pillar A · Foundations and quality {#pillar-a}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| A1 | New repo with Bun and Turborepo | <span className="pill pill--f0">F0</span> | Bun workspaces with apps, modules and packages; common build, test and lint scripts. |
| A2 | Conventions and ADRs | <span className="pill pill--f0">F0</span> | Strict TS, Biome, naming, module structure and the first written decisions. |
| A3 | Boundaries with dependency-cruiser | <span className="pill pill--f0">F0</span> | The build fails if a module imports another or if domain touches the database. |
| A4 | CI/CD with previews | <span className="pill pill--f0">F0</span> | GitHub Actions: types, lint, tests and migrations on every PR; preview per branch. |
| A5 | Dev, staging and prod environments | <span className="pill pill--f0">F0</span> | Database, API, worker, N8N and frontends separated per environment, with managed secrets. |
| A6 | API skeleton with Hono on Bun | <span className="pill pill--f0">F0</span> | Routes per module, Zod validation, generated OpenAPI and a typed client. |
| A7 | @atrium/ui with brand tokens | <span className="pill pill--f0">F0</span> | Base UI primitives with brand styles in Tailwind v4, dark mode and the chart primitives. |
| A8 | Monitoring, logs and test harness | <span className="pill pill--f0">F0</span> | Sentry, structured logs with the client in every line, and the contract, isolation and golden-case test setup. |

## Pillar B · Core business {#pillar-b}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| B1 | Auth with organizations | <span className="pill pill--f0">F0</span> | Better Auth: login, organizations, invitations and sessions. |
| B2 | Clients, locations and roles | <span className="pill pill--f0">F0</span> | Agency admin, Account Manager, agency staff with team roles, owner and restaurant staff. |
| B3 | Isolation between clients | <span className="pill pill--f0">F0</span> | Repositories that require the client, plus RLS as a second defense, with tests on every table. |
| B4 | Single guest identity | <span className="pill pill--f0">F0</span> | One guest per client with normalized email and phone and the identifiers stitching uses. |
| B5 | Consent log | <span className="pill pill--f0">F0</span> | Consent per channel and purpose, with date, opt-in source and opt-out. |
| B6 | Event queue with pg-boss | <span className="pill pill--f0">F0</span> | Enqueue in the same transaction; worker with retries and scheduled jobs. |
| B7 | @atrium/contracts with Zod | <span className="pill pill--f0">F0</span> | Versioned schemas for events, signal rows and public requests. |
| B8 | Packages and feature flags | <span className="pill pill--f0">F0</span> | The access matrix published as flags per module and location; one answer for every surface. |

## Pillar C · Data backbone {#pillar-c}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| C1 | Signals schema and partitions | <span className="pill pill--f0">F0</span> | The six tables, monthly partitions for `signals_daily`, isolation tests. |
| C2 | Ingestion API | <span className="pill pill--f0">F0</span> | Validated, idempotent on the natural key, scoped tokens per connector, rejects unknown signal types. |
| C3 | Metric registry and rollups | <span className="pill pill--f1">F1</span> | The inventory as data; `metrics_daily` rebuilt idempotently from signals. |
| C4 | @atrium/scoring | <span className="pill pill--f1">F1</span> | Normalization against the benchmark, the 60/40 blend and the Growth Score, as pure functions with golden cases. |
| C5 | Benchmarks | <span className="pill pill--f1">F1</span> | `benchmarks_monthly` with a sample size; aggregates only; nullable by metric. |
| C6 | Agent grades | <span className="pill pill--f1">F1</span> | `agent_grades` with evidence and the Account Manager override. |
| C7 | Manual daily entry and worksheet | <span className="pill pill--f1">F1</span> | Entry sections by package, timestamped, writing signals with `source = manual`; the monthly worksheet as an import. |
| C8 | Freshness and alerts | <span className="pill pill--f1">F1</span> | Last successful sync per source, stale alerts, rejected-row counts. |

## Pillar D · Connectors {#pillar-d}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| D1 | N8N environment | <span className="pill pill--f1">F1</span> | N8N hosted per environment; workflows exported to the repo; secrets in the manager. |
| D2 | Toast | <span className="pill pill--f1">F1</span> | Nightly export first; orders, revenue, guests, average ticket, repeat visits, loyalty. |
| D3 | Metricool | <span className="pill pill--f1">F1</span> | IG, FB, TikTok and YouTube metrics with per-post rows every 6 hours. |
| D4 | Google Business Profile | <span className="pill pill--f1">F1</span> | Profile actions, searches, reviews and local rank, daily. |
| D5 | Meta Ads | <span className="pill pill--f1">F1</span> | Spend, impressions, reach, clicks and conversions by campaign and ad set. |
| D6 | Google Ads | <span className="pill pill--f1">F1</span> | Spend, impressions, clicks and conversions by campaign. |
| D7 | Resend | <span className="pill pill--f4">F4</span> | Email sends, deliveries, bounces, complaints, opt-outs and webhooks. |
| D8 | Rank tracker and brand survey | <span className="pill pill--f2">F2</span> | Maps rank for the client keywords; the quarterly brand survey imported by zone. |

## Pillar E · Platform {#pillar-e}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| E1 | Platform shell | <span className="pill pill--f2">F2</span> | Navigation, location switcher, date range, radius toggle, export, freshness line and locked states. |
| E2 | Dashboard | <span className="pill pill--f2">F2</span> | Growth Score, engine scores, brand awareness map, momentum, wins and the guest journey. |
| E3 | Discoverability and the hub | <span className="pill pill--f2">F2</span> | Setup readiness, listings, GBP actions; the hub and its buttons as signals. |
| E4 | Attention | <span className="pill pill--f2">F2</span> | Attention score, how people found you, content that got you seen, channel to stage to outcome. |
| E5 | Reputation and the survey flow | <span className="pill pill--f2">F2</span> | Rating, velocity, the review feed, the survey by QR and link, the review button for everyone. |
| E6 | Attribution | <span className="pill pill--f4">F4</span> | Stitching, methods, channel mix and cost per action; labeled estimates. |
| E7 | Retention and Growth | <span className="pill pill--f4">F4</span> | Guestbook, segments, automations, cohorts; programs, offers and budget pacing. |
| E8 | Benchmarks, Reporting and Settings | <span className="pill pill--f6">F6</span> | The radius bars, the report builder with the narrative, the archive, sources and team. |

## Pillar F · Agency OS {#pillar-f}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| F1 | Manager shell and role views | <span className="pill pill--f3">F3</span> | Navigation, "view as" a role, search, new content. |
| F2 | Portfolio and client workspace | <span className="pill pill--f3">F3</span> | Health, roster, needs attention, launching this week; one client with cycle, content and sources. |
| F3 | Client COG | <span className="pill pill--f3">F3</span> | Team, scope by group, cycle calendar, ceilings, guardrails, weekly rules, tech stack, dates, change log. |
| F4 | Tasks database and cycle firing | <span className="pill pill--f3">F3</span> | The Account Manager fires the cycle from the COG; views by person, project and stage. |
| F5 | Content module and board | <span className="pill pill--f3">F3</span> | Eight statuses, owners, formats, labels with ceilings, tickets and comments. |
| F6 | Studio | <span className="pill pill--f3">F3</span> | Posting calendar, ready to post, batch timelines, daily pending and email. |
| F7 | Approvals across surfaces | <span className="pill pill--f3">F3</span> | One queue read by the Manager, the Platform and, later, Mobile. |
| F8 | Daily entry, data status and capacity | <span className="pill pill--f3">F3</span> | The manual log UI, the integration matrix per client and the team capacity view. |

## Pillar G · Agents and MCP {#pillar-g}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| G1 | Versioned agent manifest | <span className="pill pill--f0">F0</span> | Tools, levels, limits, `never` rules and escalation of each subagent, in the repo. |
| G2 | Policy engine | <span className="pill pill--f0">F0</span> | Decides on every call: executes, asks for approval or rejects. |
| G3 | MCP gateway with identity per agent | <span className="pill pill--f0">F0</span> | Each subagent identifies itself and only sees the tools of its manifest and its package. |
| G4 | Audit log | <span className="pill pill--f0">F0</span> | Every call with masked input and output, decision, approver and cost. |
| G5 | Evals harness | <span className="pill pill--f5">F5</span> | Golden cases, limits, `never` rules, prompt injection and missing-data cases, run in CI. |
| G6 | Scorekeeper and practice grades | <span className="pill pill--f5">F5</span> | Weekly grades from the observing subagents; engine scores and the Growth Score. |
| G7 | Echo, Ask and Sentiment | <span className="pill pill--f5">F5</span> | Reply drafts with approval, review requests to everyone, themes. |
| G8 | Narrator and Strategist | <span className="pill pill--f5">F5</span> | The monthly narrative for the strategist to edit; the MAP and the 90-day roadmap. |

## Pillar H · Pilot, Mobile and launch {#pillar-h}

| # | Task | Phase | Detail |
| --- | --- | --- | --- |
| H1 | Choose 1–2 pilot clients | <span className="pill pill--f1">F1</span> | Restaurants with Toast and an active Google profile. |
| H2 | Onboard and connect sources | <span className="pill pill--f2">F2</span> | COG written, tech stack connected or marked pending. |
| H3 | Mobile app | <span className="pill pill--f6">F6</span> | Expo app on the same API: the five tabs, approvals, requests and push opt-in. |
| H4 | Hub and QR rollout | <span className="pill pill--f2">F2</span> | Hub links in GBP and Instagram; survey QRs on tables and receipts. |
| H5 | Train the team | <span className="pill pill--f3">F3</span> | Short sessions for each role on the Manager and for the owner on the Platform. |
| H6 | Two weeks of pilot | <span className="pill pill--f3">F3</span> | Real use with daily follow-up on the Platform and the Manager. |
| H7 | Metrics review and calibration | <span className="pill pill--f6">F6</span> | Weights and targets calibrated with the first 5 clients; benchmark sample sizes reviewed. |
| H8 | Launch and portfolio migration | <span className="pill pill--f6">F6</span> | Every client onboarded, each source connected or pending, the old reporting retired. |
