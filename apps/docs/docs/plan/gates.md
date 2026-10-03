---
sidebar_position: 2
title: "Phase gates"
description: "Criteria for moving from one phase to the next."
---

# Nothing moves on *without meeting its gate*

## G0 · 30 Oct · Foundations ready

- [ ] Repo with Bun and Turborepo, CI/CD and 3 environments (dev, staging, prod)
- [ ] Login with organizations, roles and team roles
- [ ] Isolation between clients tested (repository and RLS), including the signals tables
- [ ] The queue delivers events with retries and idempotency
- [ ] MCP gateway with policies and audit, tested with a sample tool
- [ ] The ingestion API accepts, validates and deduplicates a signal row
- [ ] `@atrium/ui` with base primitives and brand tokens

## G1 · 27 Nov · Data flowing

- [ ] Toast, Metricool, Google Business Profile, Meta Ads and Google Ads land in `signals_daily` for 2 clients
- [ ] Every metric in the inventory resolves to a formula, a unit, a stage and an engine
- [ ] Rollups are rebuilt idempotently and reproduce the same numbers
- [ ] Engine scores and the Growth Score compute for 2 clients, with benchmarks that carry a sample size
- [ ] Manual daily entry covers every source, so no number depends on a connector
- [ ] Freshness per source is visible, with an alert when a connector goes stale

## G2 · 23 Dec · Client dashboard live

- [ ] Dashboard, Discoverability, Attention and Reputation show real data for 2 clients
- [ ] The survey flow shows the Google review button to everyone, regardless of rating
- [ ] The hub is live and its button taps appear as signals
- [ ] Locked sections render with their teaser
- [ ] E2E, accessibility and performance gates green

## G3 · 29 Jan · Agency running on it

- [ ] The Manager shows the portfolio, client workspaces and client health
- [ ] A COG fires the cycle's tasks; tasks, content board and studio are usable by every role
- [ ] Content moves through the eight statuses, and an approval in the Platform reaches the calendar
- [ ] The team runs one full cycle for the pilot clients on it
- [ ] Daily entry writes `signals_daily` with `source = manual`

## G4 · 5 Mar · Full client dashboard

- [ ] Attribution with identity stitching: a QR scan and the order it led to count as one guest
- [ ] Every attributed dollar shows its method; estimates are labeled
- [ ] Email through Twilio with opt-outs reflected in the consent log; SMS enabled for a client only after its registration is approved
- [ ] Growth programs, offers and budget pacing
- [ ] Package access enforced on every surface and by the MCP gateway

## G5 · 26 Mar · First agents in production

- [ ] The evals harness runs in CI and 100% of `never` rules hold
- [ ] Scorekeeper and the practice grades produce the weekly scores
- [ ] Echo drafts replies that a person approves; Ask sends review requests to everyone
- [ ] Narrator drafts the monthly narrative; the strategist edits it
- [ ] Kill switch and autonomy levels work from the Manager

## G6 · 30 Apr · Complete system

- [ ] Benchmarks, Reporting, report builder and Settings live
- [ ] The Mobile app is in the stores' beta channels and reads the same data
- [ ] Weights calibrated with the first 5 clients
- [ ] The whole portfolio is onboarded, with every source connected or marked pending
