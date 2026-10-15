---
sidebar_position: 1.5
title: "Week 0 checklist"
description: "Everything to start, request or decide before and during the first week of F0."
---

# Week 0: *start the clocks that are not yours*

Phase F0 starts on Monday 5 October 2026. Week 0 is what has to be moving before that day, because several items depend on third parties and take weeks. None of it is code. Tick items here as they close; the dates in [Phases and calendar](./) are validated against this list.

:::caution Order matters
Do section 1 first. Those requests wait on someone else, so every day they sit unsent moves a gate.
:::

## 1. Requests with external wait

Send them all before touching the repository. The waits are estimates; confirm each with the provider.

| Done | Request | Needed by | Blocks | Notes |
| --- | --- | --- | --- | --- |
| [ ] | Google Business Profile API: basic access request | G1 | Reviews, profile insights | The plan assumes about six weeks and **does not block** the schedule; manual entry covers it |
| [ ] | Resend account, with the sending domain verified (SPF and DKIM) | G4 | Email sends | Email goes out only once the domain is verified |
| [ ] | Toast nightly export enabled for the pilot clients | G1 | Outcome data (orders, revenue) | Needs the client's consent and a Toast admin on their side |
| [ ] | Toast partner program application | After G1 | API route instead of export | Runs in parallel; the export is the first route |
| [ ] | Metricool API access | G1 | Social data | Confirm the plan tier includes API access |
| [ ] | Meta Ads API access and app review | G1 | Paid social | App review has an uncertain wait; start now |
| [ ] | Google Ads developer token | G1 | Paid search | Basic access needs an approved manager account |
| [ ] | Apple Developer Program and Google Play Console accounts | F6 | Mobile beta | Organization enrollment needs a D-U-N-S number; start early if the agency has none |

## 2. Decisions to close this week

Only the decisions that block F0 or F1. The rest of [Open decisions](./open-decisions) can wait for their phase.

| # | Decision | Why it blocks | Recommendation |
| --- | --- | --- | --- |
| 1 | How many people build | The whole calendar depends on it (about 30 weeks with one, 20 with two) | One developer with Claude Code, as the plan assumes |
| 12 | Where API, worker, agents and N8N run | Sets the environments, CI deploy targets and secrets | Railway, with Fly.io as the fallback |
| 15 | Brand tokens: brand system versus product theme | `@atrium/ui` is a G0 item and needs one set of tokens | Reconcile into `packages/ui` before F0 week 3 |
| 17 | Which two restaurants are the pilot | Their sources must be connected by the end of F1 or G2 moves | Choose now: Toast, an active Google profile, an owner who will answer |
| 11 | Toast route | Defines the first connector | Nightly export first, partner program in parallel |
| 18 | Status of the HTML prototypes in `guides-rules` | Avoids porting prototype code by accident | Design references only |

## 3. Accounts and environments

Three environments from day one: **dev**, **staging**, **prod**. Create the accounts once and the three projects inside each.

| Done | Service | Used for | Dev | Staging | Prod |
| --- | --- | --- | --- | --- | --- |
| [ ] | GitHub organization and repository | Code, CI, ADRs | one repo | | |
| [ ] | Vercel | Platform, Manager, Hub | [ ] | [ ] | [ ] |
| [ ] | Railway | API, worker, agents, N8N | [ ] | [ ] | [ ] |
| [ ] | Supabase | Postgres, one project per environment | [ ] | [ ] | [ ] |
| [ ] | N8N | Connectors | local (Docker) | [ ] | [ ] |
| [ ] | Sentry | Errors and failed jobs | [ ] | [ ] | [ ] |
| [ ] | Anthropic API key | Agents (from F5; evals earlier) | [ ] | [ ] | [ ] |
| [ ] | Email sending domain | SPF, DKIM and DMARC records | | [ ] | [ ] |

:::note
Keep secrets out of the repository from the first commit. One secret store per environment, and a committed `.env.example` that lists names with no values.
:::

## 4. Repository bootstrap

These close the first G0 item (repo, CI/CD, 3 environments). They are the first days of F0, listed here so Monday starts with no decisions left.

- [ ] Create the `atrium` repository with the layout from [Repository and modules](../architecture/repository)
- [ ] Bun workspaces and Turborepo, Bun version pinned in `packageManager` ([ADR 0002](../adr/0002-bun-and-turborepo))
- [ ] `packages/config`: strict `tsconfig`, Biome, shared settings
- [ ] dependency-cruiser rules that fail the build when a module imports another ([ADR 0001](../adr/0001-modular-monolith))
- [ ] `docker-compose.yml` with Postgres and N8N for local development
- [ ] `.env.example` with every variable name, grouped by service
- [ ] CI on every pull request: install, lint, type-check, `check:deps`, tests against real Postgres
- [ ] Branch protection on `main`: review required, CI green, no direct pushes
- [ ] Deploy pipelines: Vercel for the web apps, Railway for API and worker, per environment
- [ ] Copy `docs/adr/` into the repository
- [ ] Move this documentation to `apps/docs`, or keep it as its own repository (decide and record it)
- [ ] Update [Local development](../guides/local-development) once the skeleton runs

## 5. Ready to start F0

Week 0 is closed when:

- [ ] Every request in section 1 has been sent, with the date written next to it
- [ ] Decisions 1, 11, 12, 15, 17 and 18 have an owner and an answer
- [ ] The accounts in section 3 exist and the person building has access to all of them
- [ ] The repository bootstraps from an empty clone with `bun install` and CI is green on the first pull request
- [ ] The pilot clients know the build is starting and who their contact is
