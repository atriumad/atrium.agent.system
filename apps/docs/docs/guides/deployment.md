---
sidebar_position: 2.7
title: "Deployment"
description: "Staging and production: what the pipelines do and how to create the projects once."
---

# *Deployment*

Three environments. **Dev** is your machine (`docker-compose`). **Staging** deploys by itself on every merge to `main`. **Production** is promoted by hand, with a reviewer's approval.

| Piece | Where | Per environment |
| --- | --- | --- |
| Postgres | Supabase | one project each for staging and prod |
| `api`, `agents`, `worker` | Railway | one Railway project each, three services inside |
| `platform`, `manager`, `hub`, `qr-card` | Vercel | one Vercel project per app per environment (8 in all) |

## What the pipeline does

`deploy.yml` runs in this order, and stops at the first failure:

1. **migrate**: `bun run db:migrate` against that environment's database, as the owner role.
2. **railway**: deploys `agents`, then `api`, then `worker`.
3. **vercel**: builds and deploys the four web apps.
4. **smoke**: `GET /health` on the API and a `200` from each web app.

- `deploy-staging.yml` starts when CI succeeds on `main`.
- `deploy-prod.yml` is started by hand with a commit SHA that is already in staging. The `production` GitHub Environment holds it until a reviewer approves.

Migrations run before the new code, so each one must work with the code that is still running (add first, remove in a later release).

## One-time setup

Do this once per environment. You need the Supabase, Railway and Vercel accounts and admin rights on the GitHub repository.

### 1. Supabase

1. Create the project `atrium-staging` (and `atrium-prod`). Pick the same region as Railway.
2. Copy the **direct** connection string (port 5432, not the pooler): it is `DATABASE_ADMIN_URL` for the owner role.
3. Choose a long random `ATRIUM_APP_PASSWORD`. The first migration creates the `atrium_app` role with it.
4. `DATABASE_URL` is the same host with user `atrium_app` and that password. The app never connects as the owner, so RLS always applies.

### 2. Railway

1. Create the project `atrium-staging` with an environment called `staging` (and `atrium-prod`).
2. Add three services from this GitHub repo: `api`, `agents`, `worker`. The service names must match exactly.
3. In each service, Settings → Config-as-code → set the path to `deploy/railway/<service>.json`.
4. Give `api` and `agents` a public or private domain. `worker` has no port.
5. Set the variables listed below.
6. Create a **project token** for the environment (Project Settings → Tokens). It is `RAILWAY_TOKEN`.

### 3. Vercel

1. Create four projects per environment, for example `atrium-platform-staging`. In each: Root Directory `apps/<app>`, framework Next.js, and "Include files outside the Root Directory" on.
2. Set each project's variables, below. `API_URL` is read when the app builds, so change it and redeploy together.
3. Create one access token (`VERCEL_TOKEN`). Note the team id (`VERCEL_ORG_ID`) and each project id.

### 4. GitHub

Create two Environments, `staging` and `production`. On `production`, add yourself as a required reviewer and limit it to `main`.

In each Environment:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `DATABASE_ADMIN_URL` | owner connection string |
| Secret | `ATRIUM_APP_PASSWORD` | the app-role password |
| Secret | `RAILWAY_TOKEN` | that environment's project token |
| Secret | `VERCEL_TOKEN` | Vercel access token |
| Variable | `VERCEL_ORG_ID` | Vercel team id |
| Variable | `VERCEL_PROJECT_PLATFORM`, `_MANAGER`, `_HUB`, `_QR_CARD` | the four project ids |
| Variable | `API_URL`, `PLATFORM_URL`, `MANAGER_URL`, `HUB_URL`, `QR_CARD_URL` | public origins, no trailing slash, used by the smoke step |

Also turn on branch protection for `main`: review required, CI green, no direct pushes.

## Variables per service

Names come from `.env.example`. Values live only in each platform's secret store.

| Service | Needs |
| --- | --- |
| `api` | `NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `AGENCY_SLUG`, `PUBLIC_BASE_URL`, `HUB_URL`, `PLATFORM_URL`, `SURVEY_SECRET`, `INGESTION_API_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `LOYALTY_SECRET`, `LOYALTY_PROXY_SECRET`, `QR_CARD_URL`, `TRUST_PROXY`, `SENTRY_DSN` |
| `agents` | `NODE_ENV=production`, `DATABASE_URL`, `AGENTS_SERVICE_TOKEN`, `PUBLIC_BASE_URL`, `SURVEY_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `HOST_LLM_API_KEY`, `HOST_MODEL_DEFAULT`, `HOST_MODEL_SENTIMENT`, `SENTRY_DSN` |
| `worker` | `NODE_ENV=production`, `DATABASE_URL`, `AGENTS_URL`, `AGENTS_SERVICE_TOKEN`, `SENTRY_DSN` |
| `platform`, `manager`, `hub` | `API_URL` (the API's public origin) |
| `qr-card` | `API_URL`, `LOYALTY_PROXY_SECRET` (the same value as on the API), `QR_CARD_PROXY_HOPS` |

Railway sets `PORT` itself and the API and agents read it. Do not set `AGENTS_PORT` there. Use a different value for every secret in staging and prod: never reuse one.

## First run

1. Merge to `main`. Watch `Deploy staging`. A red `smoke` step names the URL that failed.
2. Open the staging Platform and sign in.
3. When staging is good, run **Deploy production** from the Actions tab with the staging commit SHA, and approve it.

## Roll back

- **Vercel:** Deployments → previous deployment → Promote.
- **Railway:** the service's Deployments → Redeploy the earlier one.
- **Database:** there is no automatic rollback. Write a new forward migration. If a bad one is half-applied, each file runs in one transaction, so nothing is left in the middle.
