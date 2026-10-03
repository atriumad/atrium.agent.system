---
id: 0007-api-with-hono
sidebar_position: 8
title: "0007 · API with Hono and generated OpenAPI"
sidebar_label: "0007 · API with Hono and generated OpenAPI"
description: "API with Hono and generated OpenAPI"
---

# ADR 0007: API with Hono and generated OpenAPI

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Several apps, the connectors and the agents consume the same operations. An explicit contract and shared types are needed.

## Decision

`apps/api` mounts each module's routes, and the ingestion API, with Hono and zod-openapi on Bun. The OpenAPI is generated from the code and produces a typed client for the web and mobile apps.

## Consequences

- Single, verifiable contract in CI.
- The backend is not tied to Next.js.

## Discarded alternatives

- Next.js API routes or server actions: they mix interface and backend.
- tRPC: couples the client to TypeScript and does not produce a public contract for connectors.
