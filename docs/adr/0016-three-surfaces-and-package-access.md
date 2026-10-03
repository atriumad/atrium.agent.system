---
id: 0016-three-surfaces-and-package-access
sidebar_position: 17
title: "0016 · Three surfaces and package-based access"
sidebar_label: "0016 · Three surfaces and package-based access"
description: "Three surfaces and package-based access"
---

# ADR 0016: Three surfaces and package-based access

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Owners, the agency team and the owner on the go need different views of the same data. What a client sees depends on the package they bought.

## Decision

Three surfaces on one API and one data model: the Platform (Next.js, the client), the Manager (Next.js, the agency) and Mobile (Expo, the owner). Access is computed once in Core from the package and the role and read by every surface and by the MCP gateway. Locked sections stay visible with a teaser and keep ingesting data.

## Consequences

- Each surface is simple for its audience.
- One access answer: a locked module has no agent tools either.
- Unlocking is instant because the data is already there.
- Three apps to maintain; mitigated by shared types, API client and `@atrium/ui`.

## Discarded alternatives

- One app with roles: the agency and client experiences pull in different directions.
- A PWA instead of native: weaker push and store presence for owners.
- Native apps: two more codebases for a small team.
