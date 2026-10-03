---
id: 0001-modular-monolith
sidebar_position: 2
title: "0001 · Modular monolith with verified boundaries"
sidebar_label: "0001 · Modular monolith with verified boundaries"
description: "Modular monolith with verified boundaries"
---

# ADR 0001: Modular monolith with verified boundaries

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Atrium builds one platform with five engines, three surfaces and many agents, with a small team. Each module must be able to evolve without breaking the others, and some may need to scale separately in the future.

## Decision

A single deployable system divided into modules (`modules/*`) with their own database schema, API, events and MCP tools. Modules communicate only through events and the public APIs of Core and `signals`. dependency-cruiser in CI breaks the build if a module imports another.

## Consequences

- One deployment, one database, one way to observe: simple operation for a small team.
- Each module can be extracted into a service without rewriting its logic.
- Requires discipline in event contracts; CI covers it.

## Discarded alternatives

- Microservices: too much operation (networks, deployments, distributed observability) for the size of the team.
- Monolith without boundaries: fast at first, couples the agents and makes every change expensive.
