---
sidebar_position: 1
title: "Decisions (ADR)"
description: "Architecture decision record."
---

# Decision *record*

Every important technical decision is written down in a short ADR: context, decision, consequences and alternatives. An accepted ADR is not edited; if the decision changes, a new one is written that replaces it.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](./0001-modular-monolith) | Modular monolith with verified boundaries | Accepted |
| [0002](./0002-bun-and-turborepo) | Bun with workspaces and Turborepo | Accepted |
| [0003](./0003-nextjs-16) | Next.js 16 for the web surfaces | Accepted |
| [0004](./0004-base-ui-and-tailwind) | Base UI for primitives and Tailwind for styles | Accepted |
| [0005](./0005-postgres-and-drizzle) | PostgreSQL with Drizzle and one schema per module | Accepted |
| [0006](./0006-events-with-pg-boss) | Transactional events and jobs with pg-boss | Accepted |
| [0007](./0007-api-with-hono) | API with Hono and generated OpenAPI | Accepted |
| [0008](./0008-own-data) | Own data before integrations | Superseded by 0013 and 0014 |
| [0009](./0009-agents-mcp-and-policies) | Agents with MCP tools and a policy engine | Accepted |
| [0010](./0010-email-only-notifications) | Email-only notifications in the MVP | Superseded by 0017 |
| [0011](./0011-better-auth) | Better Auth with organizations | Proposed |
| [0012](./0012-own-reservations-by-covers) | Own reservations by cover pacing | Deferred |
| [0013](./0013-signals-data-model) | Signals, metrics and scores in six tables | Accepted |
| [0014](./0014-n8n-connectors-with-ingestion-api) | N8N connectors that call an ingestion API | Accepted |
| [0015](./0015-scoring-model) | Engine scores: 60% measured, 40% practice | Accepted |
| [0016](./0016-three-surfaces-and-package-access) | Three surfaces and package-based access | Accepted |
| [0017](./0017-twilio-email-and-sms) | Twilio for email and SMS | Superseded by 0021 |
| [0018](./0018-no-review-gating) | Review requests are never filtered by rating | Accepted |
| [0019](./0019-llm-provider-behind-a-port) | The language model sits behind a port | Accepted |
| [0020](./0020-agents-in-their-own-service) | Agents live in their own service | Accepted |
| [0021](./0021-resend-email-no-sms) | Resend for email, no SMS | Accepted |
| [0022](./0022-loyalty-card-device-bound) | The loyalty card is anonymous and bound to a device | Accepted |

To write a new one, see [How to write an ADR](../guides/write-an-adr).
