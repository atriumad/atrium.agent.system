---
sidebar_position: 3
title: "Testing strategy"
description: "What each level tests and when it passes."
---

# Testing *strategy*

Tests run in CI on every pull request; load tests and the pilot run before each gate.

| Level | Tool | What it tests | Pass criterion |
| --- | --- | --- | --- |
| Architecture | dependency-cruiser | No module imports another; `domain/` without IO | 0 violations |
| Unit | bun test | Scoring, normalization, formulas, statuses, rules, use cases | Coverage ≥ 90% on `@atrium/scoring` and on metric formulas |
| Contract | bun test + Zod + OpenAPI | Events, endpoints and signal rows meet their schema | Everything with a valid and an invalid example |
| Connectors | Recorded fixtures per provider | Each connector maps the provider's payload to signal rows | Fixtures reproduce the expected rows; a changed payload fails the build |
| Data quality | bun test + Postgres in Docker | Ingestion is idempotent; rollups reproduce; no negative or duplicate counts | 0 discrepancies between a re-run and the first run |
| Scoring | Golden cases | Known inputs give known engine scores and Growth Score | Scores match the golden table exactly |
| Isolation | bun test + Postgres in Docker | A client never sees another's data, including signals, scores and benchmarks | 0 rows visible between clients |
| Integration | bun test + Postgres in Docker | API, queue and worker against a real database | Every endpoint with a happy-path and an error case |
| Agents | Evals per subagent | Golden cases, limits, `never` rules, prompt injection | 100% of `never` rules respected |
| End to end | Playwright (mobile and desktop) | Dashboard filters, locked sections, survey by QR and link, approval, content move, COG firing | Critical flows green in staging |
| Mobile | Maestro on a device farm | Sign in, tabs, approve, push opt-in | Critical flows green on iOS and Android |
| Performance | k6 | Dashboard reads over 90 days; ingestion throughput; rollup rebuild | Dashboard p95 < 2 s; a month of signals for 10 locations rebuilt in < 60 s |
| Accessibility | axe + manual review | Platform, Manager, survey and hub with keyboard and screen reader | 0 critical errors |
| Messages | React Email preview | Templates in Gmail, Outlook and Apple Mail; opt-out links | Every link works and expires on time |
| Acceptance | Pilot | Real use for 2 weeks | No serious incidents; the team runs a cycle without outside help |
