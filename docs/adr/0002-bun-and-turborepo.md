---
id: 0002-bun-and-turborepo
sidebar_position: 3
title: "0002 · Bun with workspaces and Turborepo"
sidebar_label: "0002 · Bun with workspaces and Turborepo"
description: "Bun with workspaces and Turborepo"
---

# ADR 0002: Bun with workspaces and Turborepo

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

The repository contains several apps and modules in TypeScript. The goal is to install, run and test quickly, with few tools.

## Decision

Bun as package manager (workspaces), runtime for the API, worker and agents, and unit test runner. Turborepo orchestrates tasks and caches builds.

## Consequences

- One binary to install, run and test.
- Hono, Drizzle and pg-boss support Bun.
- Some libraries may assume Node: each new dependency is verified in CI.

## Discarded alternatives

- pnpm + Node: more pieces for the same result.
- npm workspaces: slower and without the runtime's advantages.
