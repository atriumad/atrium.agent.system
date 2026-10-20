---
sidebar_position: 2.5
title: "Environment variables"
description: "Every variable the repository reads, what it does, its default and who needs it."
---

# *Environment* variables

The names live in `.env.example` at the repository root; the real values live in `.env.local` (never committed) and in each environment's secret store. This page says what each variable does. Defaults are the ones in the code.

How to read the tables: **Required** says when the process refuses to start without the variable. A default means you can leave it empty in development.

:::note
Outside development and test, treat an unset `NODE_ENV` as production. The email transport and the webhook check below fail closed on purpose.
:::

## Core

| Variable | What it is | Default | Who reads it |
| --- | --- | --- | --- |
| `NODE_ENV` | `development`, `test` or `production`. Outside development and test the API and the agents service require the email, webhook and public URL variables, and `:free` models are refused. | none (counts as production) | API, agents, email transport |
| `DATABASE_URL` | Postgres connection as the `atrium_app` role, which is subject to RLS. Everything at runtime uses it. | none | API, worker, `modules/core`, seed |
| `DATABASE_ADMIN_URL` | Postgres connection as the owner role, which bypasses RLS. Only for migrations and the seed. Never give it to a running service. | none (the seed falls back to a local `atrium` role) | `scripts/migrate.ts`, seed |
| `ATRIUM_APP_PASSWORD` | Password the migration sets on the `atrium_app` role. | `atrium_app` | `scripts/migrate.ts` |
| `BETTER_AUTH_SECRET` | Secret that signs sessions. Long and random. Without it the API still takes connector traffic, but sign-in and the case routes do not work. | none | API |
| `BETTER_AUTH_URL` | Public base URL of the API for auth callbacks and cookies. | `http://localhost:3001` | API |
| `AGENCY_SLUG` | Slug of the agency the API and the worker serve. The seed creates `demo-atrium`. | `atrium` | API, worker |
| `TRUSTED_ORIGINS` | Origins allowed to call the API with credentials, comma separated. | `http://localhost:3002,http://localhost:3003` | API |
| `PORT` | Port the API listens on. Not listed in `.env.example`. | `3001` | API |

## Screens and links

The Hub is where guests open survey links and QR codes. These variables tell each process where the others live.

| Variable | What it is | Default | Who reads it |
| --- | --- | --- | --- |
| `API_URL` | Where Manager, Platform, Hub and the card app (`/loyalty-api`) proxy `/api` and their public routes to. Also where the Resend webhook must point (`<API_URL>/webhooks/resend`). | `http://localhost:3001` | Manager, Platform, Hub, qr-card, seed |
| `HUB_URL` | URL of the Hub, used to build survey and QR links. | `http://localhost:3004` | API |
| `PLATFORM_URL` | URL of Platform, used in links to the owner's screen. | `http://localhost:3003` | API |
| `PUBLIC_BASE_URL` | Public base URL used for links inside emails. **Required** by the agents service outside development and test. | `http://localhost:3001` | agents, seed |
| `ADMIN_BASE_URL` | Optional base URL for links meant for the account manager. Not in `.env.example`. | not set | agents |
| `SURVEY_SECRET` | HMAC secret that signs QR tokens and unsubscribe tokens (`un1.<clientId>.<guestId>.<signature>`). The API and the agents service must share the same value. If it changes, every link already sent stops working. | `BETTER_AUTH_SECRET` | API, agents |

## Email (Resend)

| Variable | What it is | Default | Who reads it |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Resend API key. | none | API, agents |
| `EMAIL_FROM` | Sender address of every email. | none | API, agents |
| `RESEND_WEBHOOK_SECRET` | The `whsec_...` secret Resend signs its webhooks with. **Required** by the API outside development and test, because without it a forged event cannot be told from a real one. Any `whsec_` value works locally. | none | API |

`RESEND_API_KEY` and `EMAIL_FROM` go together: setting only one is an error. With both empty and `NODE_ENV` set to `development` or `test`, mail is recorded in the outbox and not sent. With both empty anywhere else, the process does not start.

## Agents

Host's agents run in their own service ([ADR 0020](../adr/0020-agents-in-their-own-service)), and the worker calls it. The model runs behind a port ([ADR 0019](../adr/0019-llm-provider-behind-a-port)).

| Variable | What it is | Default | Who reads it |
| --- | --- | --- | --- |
| `AGENTS_PORT` | Port of the agents service. | `3005` | agents |
| `AGENTS_URL` | Where the worker finds the agents service. **Required** by the worker. | none | worker |
| `AGENTS_SERVICE_TOKEN` | Shared token between the worker and the agents service. Any random string of 32 characters or more; a shorter one makes the agents service refuse to start. **Required** by both. | none | worker, agents |
| `HOST_LLM_API_KEY` | Host's model key, shared by its subagents. Empty means no model: Sentiment answers "rejected" and Recovery still works from the rating. | none | agents |
| `HOST_MODEL_DEFAULT` | Model every Host subagent uses unless it has its own. | none | agents |
| `HOST_MODEL_SENTIMENT` | Model for `host.sentiment`. Falls back to `HOST_MODEL_DEFAULT`. | none | agents |
| `HOST_MODEL_TIMEOUT_MS` | Time limit of one model call, in milliseconds. A reading holds a database transaction for that long, so keep it low in production. Free reasoning models need about 60000. Ignored if it is not a positive whole number. | `15000` | agents |
| `HOST_ALLOW_FREE` | Set to `true` to allow a model id ending in `:free` outside development and test. Only for test data. | not set | agents |

## Stamp card (loyalty)

| Variable | What it is | Default | Who reads it |
| --- | --- | --- | --- |
| `LOYALTY_SECRET` | Signs the printed join QR tokens and hashes the device cookie. A random string of 32 characters or more. Without it, or with a shorter one, the `/v1/loyalty` and `/api/loyalty` routes are not mounted. | none | API |
| `TRUST_PROXY` | Set to `1` when the card app (or a proxy you control) sits in front of the API. For the loyalty routes it is not enough alone: `X-Forwarded-For` and `X-Forwarded-Proto` are believed only with a valid `LOYALTY_PROXY_SECRET` too; otherwise the socket address is used. | not set | API |
| `LOYALTY_PROXY_SECRET` | A random string of 32 characters or more, the same for the API and qr-card. qr-card sends it in `x-atrium-proxy`; the API trusts the forwarded headers on a loyalty route only when `TRUST_PROXY` is on and the header matches. Shorter or missing: the headers are ignored (fails closed). | none | API, qr-card |
| `QR_CARD_PROXY_HOPS` | How many trusted proxies sit in front of qr-card in production. `0` means none: qr-card forwards no client address and every guest shares one set of limits. qr-card must be reachable only through the counted proxies. | `0` | qr-card |
| `QR_CARD_URL` | Public origin of the card app; the printable join QR points to `<QR_CARD_URL>/j/<token>`. Also makes the device cookie `Secure` when it starts with `https://`. | `http://localhost:3006` in `.env.example` | API |

See [Loyalty and the stamp card](./loyalty-and-qr-card) and [ADR 0022](../adr/0022-loyalty-card-device-bound).

## Connectors and providers

| Variable | What it is | Status |
| --- | --- | --- |
| `N8N_ENCRYPTION_KEY` | Key N8N uses to encrypt the credentials it stores. `docker-compose.yml` falls back to `dev-only-change-me`, so set a real one anywhere that is not your machine. | in use |
| `INGESTION_API_TOKEN` | Reserved for connector ingestion. The ingestion token that works today is issued by the signals module (it starts with `atg_`); the seed prints one. | not read by the code |
| `TOAST_EXPORT_BUCKET` | Bucket for Toast exports. | not read by the code |
| `METRICOOL_API_TOKEN` | Metricool API token. | not read by the code |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads developer token. | not read by the code |
| `META_ADS_APP_ID`, `META_ADS_APP_SECRET` | Meta Ads app credentials. | not read by the code |

The provider variables are placeholders for connectors that are not built yet. A connector sends data with its scoped token through the ingestion API, as [Add a connector](./add-a-connector) describes.

## Observability

| Variable | What it is | Status |
| --- | --- | --- |
| `SENTRY_DSN` | Sentry DSN for error reporting. | not read by the code |

## Secrets

These must never be committed or logged: `BETTER_AUTH_SECRET`, `SURVEY_SECRET`, `DATABASE_ADMIN_URL`, `AGENTS_SERVICE_TOKEN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `HOST_LLM_API_KEY`, `N8N_ENCRYPTION_KEY` and every provider token. `.env.example` holds names only.

## Keeping this page true

When a process starts reading a new variable, add it to `.env.example` and to this page in the same pull request, in both languages. When a "not read by the code" variable starts being read, change its status and fill in its row.
