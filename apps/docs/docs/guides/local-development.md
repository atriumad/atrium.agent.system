---
sidebar_position: 2
title: "Local development"
description: "Bring up the repository on your machine."
---

# *Local* development

:::note Repository to be created
These steps describe the target repository of phase F0. They are updated when the skeleton exists.
:::

## Requirements

- Bun (version pinned in `package.json` → `packageManager`)
- Docker, for local Postgres, N8N and integration tests
- Access to the development secrets

## First start

```bash
bun install
cp .env.example .env.local     # fill in development secrets
docker compose up -d postgres n8n   # local Postgres and N8N
bun run db:migrate              # migrations for all modules
bun run db:seed                 # sample client, location and 90 days of signals (Casa Olivo)
bun run dev                     # api, worker, platform, manager, hub, mobile and docs
```

The seed generates realistic daily signals for every source, so every screen has data without a single connector.

## Frequent commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Starts all apps with reload |
| `bun run test` | Unit, contract, data-quality and integration tests |
| `bun run test:e2e` | Playwright against the local environment |
| `bun run lint` | Biome: lint and format |
| `bun run check:deps` | dependency-cruiser: boundaries between modules |
| `bun run db:generate` | Generates a migration from the Drizzle schema |
| `bun run rollup` | Rebuilds `metrics_daily` and `scores_weekly` for a client and range |
| `bun run connectors:replay <provider>` | Replays a connector's recorded fixtures through the ingestion API |
| `bun run evals` | Evals for all subagents |
| `bun run --filter @atrium/docs dev` | Only this documentation |
