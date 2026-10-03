---
sidebar_position: 7
title: "Security and isolation"
description: "Auth, roles, package access, isolation between clients, secrets and personal data."
---

# Security and *isolation*

## Identity and roles

Better Auth with organizations. Each client is an organization; Atrium is the agency organization.

| Role | Scope |
| --- | --- |
| `agency_admin` | The whole portfolio and configuration |
| `account_manager` | Their assigned clients; fires tasks, approves and operates |
| `agency_staff` | Tasks for their assigned clients; a **team role** says what they do |
| `client_owner` | Their client and all its locations; approves content |
| `client_staff` | Assigned locations; view only on most sections |
| `agent` | Technical identity of a subagent; only via the MCP gateway |

The Manager's seven job functions (Account Manager, Assistant Account Manager, Creative Director, Assistant Creative Director, Developer, Graphic Designer, Video Editor) are **team roles** stored on the membership. They decide which tasks a person sees and owns; the permission roles above decide what they may do.

## Package access

What a client can see is the intersection of their role and their package. Access is computed once in Core and read by every surface and by the MCP gateway; see [Packages and access](../product/packages-and-access).

## Isolation between clients

1. **Repositories with a mandatory client.** No query compiles without `clientId`.
2. **RLS in Postgres** as a second defense, in case a query slips through. The client is set per transaction (`SET LOCAL`) by the API, the worker and the agents gateway.
3. **Isolation tests** in CI: a client never sees another's rows, through the repository or through RLS. This includes `signals_daily`, `metrics_daily` and `scores_weekly`.
4. **Benchmarks are aggregates.** The 10-mile benchmark is stored without client identifiers and with a sample size; a client can never read another client's value.

## Connectors and secrets

- Provider credentials live in the platform's secret manager, per client, never in the repository or in an N8N export.
- N8N reaches the database only through the ingestion API, with a scoped token per connector.
- A connector can read and write only the data of the clients it is configured for.

## Public surfaces

- Survey and hub links with **signed tokens** of a single purpose and an expiry.
- **Rate limiting** and bot protection on the hub and on QR surveys.
- No personal data in URLs or events.

## Personal data

- Consents per channel and purpose, with date and source. Opt-in sources (POS, WiFi portal, QR, checkout) are recorded per contact.
- Erasure of a guest on request, propagated as `guest.erased`; the audit log keeps masked inputs only.
- Reviews and survey texts sent to a language model are limited to the fields the task needs; guest names and contacts are not.
