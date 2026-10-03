---
id: 0011-better-auth
sidebar_position: 12
title: "0011 · Better Auth with organizations"
sidebar_label: "0011 · Better Auth with organizations"
description: "Better Auth with organizations"
---

# ADR 0011: Better Auth with organizations

| Status | Date | Deciders |
| --- | --- | --- |
| **Proposed** | 2026-10-01 | Atrium · product and technology |

## Context

Users, organizations (agency and clients), roles, team roles and invitations are needed, with the data in our database.

## Decision

Better Auth with its organizations plugin, on the same Postgres.

## Consequences

- No per-user cost.
- Own maintenance of the auth configuration.

## Discarded alternatives

- Clerk: per-user cost.
- Supabase Auth: organizations by hand.
