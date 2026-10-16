---
sidebar_position: 2
title: "Local development"
description: "Bring up the repository on your machine."
---

# *Local* development

## Requirements

- Bun (version pinned in `package.json` → `packageManager`)
- Docker, for local Postgres and N8N
- A `.env.local` at the repository root, copied from `.env.example`. The example lists names only; ask for the development values

## First start

```bash
bun install
cp .env.example .env.local          # fill in development values (include NODE_ENV=development)
docker compose up -d postgres n8n   # local Postgres and N8N
bun --env-file=.env.local scripts/migrate.ts            # same as: bun run db:migrate
bun --env-file=.env.local apps/worker/scripts/seed.ts   # same as: bun run seed
```

The seed creates one agency (`demo-atrium`), one client with one place (Casa Olivo Bellaire), a guest with consent, a connector token and two demo users. It is safe to run twice. It prints the ids and the token that the walk-through below needs.

| User | Password | Role | Signs in at |
| --- | --- | --- | --- |
| `demo-am@demo.test` | `demo-password-1` | Account manager | Manager, `localhost:3002` |
| `demo-owner@demo.test` | `demo-password-1` | Client owner | Platform, `localhost:3003` |

## Start the apps

There is no single `dev` command yet. Start each app in its own terminal, with the variables of `.env.local` loaded and `AGENCY_SLUG=demo-atrium` (the seed's agency):

```bash
export AGENCY_SLUG=demo-atrium
bun --env-file=.env.local run --filter @atrium/api dev        # :3001
bun --env-file=.env.local run --filter @atrium/agents dev     # :3005
bun --env-file=.env.local run --filter @atrium/worker dev
bun --env-file=.env.local run --filter @atrium/manager dev    # :3002
bun --env-file=.env.local run --filter @atrium/platform dev   # :3003
bun --env-file=.env.local run --filter @atrium/hub dev        # :3004
```

Check them: `curl localhost:3001/api/auth/ok` answers `200` and the three screens answer on their ports. The worker logs `worker.started` with its consumers and jobs. The worker needs `AGENTS_URL` and `AGENTS_SERVICE_TOKEN`; start the agents service first. `AGENTS_SERVICE_TOKEN` is any random string of 32 characters or more, and the agents service refuses to start with a shorter one. The agents service also reads `PUBLIC_BASE_URL` (and optionally `ADMIN_BASE_URL`), which the worker no longer reads; outside development and test it will not start without `PUBLIC_BASE_URL`. If `HOST_LLM_API_KEY` and a model for Sentiment (`HOST_MODEL_SENTIMENT` or `HOST_MODEL_DEFAULT`) are empty, Sentiment answers `rejected`; cases still open from the rating.

Email variables. `RESEND_API_KEY` and `EMAIL_FROM` build the Resend transport; `RESEND_WEBHOOK_SECRET` (any `whsec_` value works locally) verifies Resend's webhook in the API; `SURVEY_SECRET` (a long random string, falling back to `BETTER_AUTH_SECRET`) signs the unsubscribe links, and the API and the agents service must share it. Without the Resend key and with `NODE_ENV=development`, mail is recorded in the outbox and not sent. Outside development and test, the API and the agents service refuse to start without the Resend variables. The webhook cannot reach a local machine, so to try it post a signed fixture to `POST /webhooks/resend` on the local API.

## Walk the main flow

This is the flow described in [Using the system today](../product/using-the-system). The seed prints the ids and the connector token.

```bash
# 1. An identified order, as Toast would send it (to the API, port 3001)
curl -s http://localhost:3001/v1/signals \
  -H "authorization: Bearer $CONNECTOR_TOKEN" -H 'content-type: application/json' \
  -d '{"rows":[{"date":"2026-10-15","locationId":"<location>","source":"toast","signalType":"order","value":1,"guestId":"<guest>"}]}'

# 2. Within a minute Ask sends the request. Read the link from the outbox
docker compose exec postgres psql -U atrium atrium -c \
  "select body from core.notifications where kind = 'reputation.review_request' order by created_at desc limit 1"

# 3. Open the /s/svy_… link on the Hub (:3004) and answer with 1 to 3 stars.
#    Recovery opens a case and alerts the owner and the account manager
docker compose exec postgres psql -U atrium atrium -c \
  "select severity, status, due_at from reputation.recovery_cases order by opened_at desc limit 1"
```

Then sign in to the Manager as `demo-am@demo.test`, open **Reputation → Cases**, pick the case and use **Mark contacted** and **Resolve**.

## Frequent commands

| Command | What it does |
| --- | --- |
| `bun run test` | Tests of apps, modules and config, and the UI package tests |
| `bun run lint` | Biome: lint and format (`lint:fix` writes the fixes) |
| `bun run check:deps` | dependency-cruiser: boundaries between modules |
| `bun run typecheck` | TypeScript over the whole repository |
| `bun run ci` | Lint, boundaries, types and tests, in that order |
| `bun run db:migrate` | Applies the migrations of every module |
| `bun run seed` | Demo data, described above |
| `bun run docs:dev` | Only this documentation, at `localhost:3000` |
| `bun run docs:build` | Builds the site in both languages and validates links |
