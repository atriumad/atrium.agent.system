---
sidebar_position: 2
title: "Stack"
description: "Every technology chosen, why, and what was discarded."
---

# Technology *stack*

Each choice has its own ADR with the full context.

| Layer | Choice | Why | Discarded | ADR |
| --- | --- | --- | --- | --- |
| Language | Strict TypeScript | Types end to end, from schema to screen | — | — |
| Repository and runtime | Bun (workspaces) + Turborepo | One binary to install, run and test; Turborepo orchestrates and caches | pnpm + Node | [0002](../adr/0002-bun-and-turborepo) |
| Architecture | Modular monolith | One deployment, isolated and separable modules | Microservices | [0001](../adr/0001-modular-monolith) |
| Boundaries | dependency-cruiser in CI | The build fails if a module imports another | Manual review | [0001](../adr/0001-modular-monolith) |
| Database | Managed PostgreSQL (Supabase) | Transactions, a schema per module, RLS as a second defense, monthly partitions for signals | Neon | [0005](../adr/0005-postgres-and-drizzle) |
| Data model | Signals, metrics, scores in six tables | One atom, daily grain; every screen reads built rollups | Per-source tables | [0013](../adr/0013-signals-data-model) |
| Scoring | 60% measured + 40% practice, 10-mile benchmark | Quantitative and qualitative in one number | Measured only | [0015](../adr/0015-scoring-model) |
| Data access | Drizzle ORM + SQL migrations | Schema types, readable SQL, driver for Bun SQL | Prisma | [0005](../adr/0005-postgres-and-drizzle) |
| Connectors | N8N workflows + an ingestion API | Fast to build and change per provider; validation and isolation stay in code | Direct database writes, custom connectors per provider | [0014](../adr/0014-n8n-connectors-with-ingestion-api) |
| API | Hono + zod-openapi on Bun | Native on Bun, generated OpenAPI, typed client | Next.js API routes | [0007](../adr/0007-api-with-hono) |
| Events and jobs | pg-boss + worker | Enqueue in the same transaction; retries and scheduling without another provider | QStash, Inngest | [0006](../adr/0006-events-with-pg-boss) |
| Web surfaces | Next.js 16 for Platform, Manager and Hub | Current supported version; Next.js 15 leaves security support on 21 Oct 2026 | Next.js 15, pure SPA | [0003](../adr/0003-nextjs-16) |
| Mobile | Expo (React Native) | One team, shared types and API client, store distribution | Native apps, a PWA | [0016](../adr/0016-three-surfaces-and-package-access) |
| UI | Base UI + Tailwind v4 + brand tokens | Unstyled primitives, stable since v1; the brand is applied with Tailwind | Radix directly | [0004](../adr/0004-base-ui-and-tailwind) |
| Charts and maps | Purpose-built SVG charts, MapLibre with CARTO tiles | Brand-accurate charts; the awareness map needs zones, not a full GIS | Charting suites | — |
| Data on screen | TanStack Query | Caching and consistent loading states | Loose fetch | — |
| Auth | Better Auth with organizations | Users, organizations, roles and invitations in our database | Clerk, Supabase Auth | [0011](../adr/0011-better-auth) |
| Messaging | Resend for email, React Email for templates | One provider for every send, with a signed webhook for deliveries, bounces and complaints | A campaign platform | [0021](../adr/0021-resend-email-no-sms) |
| POS | Toast (nightly export or API) | The outcome system of record for the target restaurants | Unified POS platforms | [0013](../adr/0013-signals-data-model) |
| Social data | Metricool | One feed for IG, FB, TikTok and YouTube, with per-post rows | Per-network APIs | [0014](../adr/0014-n8n-connectors-with-ingestion-api) |
| Agents | MCP (TypeScript SDK) + policy engine + Claude | Tools as the only door, rules in code | Direct API or database access | [0009](../adr/0009-agents-mcp-and-policies) |
| Hosting | Vercel (web) + Railway (API, worker, agents, N8N) | The worker and N8N need always-on processes | All serverless | — |
| LLM | OpenRouter through the Vercel AI SDK, behind a port | Provider is a model id; free to start, paid for real clients | Calling one vendor directly | [0019](../adr/0019-llm-provider-behind-a-port) |
| Observability | Sentry + structured logs (pino) | Errors, failed jobs, connector freshness and timings, with the client in every log | — | — |
| Quality | Biome, bun test, Playwright, k6, axe, evals | Tests against real Postgres; evals per agent | ESLint + Prettier | — |
