---
sidebar_position: 3
title: "Conventions"
description: "Code, names, commits and pull requests."
---

# Conventions

## Code

- Strict TypeScript. No `any` except in third-party adapters, with a comment.
- Biome for lint and formatting; formatting is not discussed in reviews.
- Validation at the edges with Zod: requests, events, signal rows, MCP tools and third-party responses.
- Domain errors as explicit types, not generic exceptions.
- Dates in UTC in the database; the signal date is the location's local day; shown in the location's time zone.
- Money in integer cents (`totalCents`). Metric units come from the registry, never from the screen.
- An estimate is a field (`method = estimate`), not a footnote.

## Names

| Element | Convention | Example |
| --- | --- | --- |
| Business terms | Those in the [glossary](../system/glossary) | `client`, `guest`, `location` |
| Packages | `@atrium/<name>` | `@atrium/contracts` |
| Database schemas | module name | `signals`, `reputation` |
| Events | `entity.past_tense_fact` | `review.received` |
| Signal types | `snake_case`, from the enum | `reserve_click` |
| Metric ids | `snake_case`, stable | `impressions_total` |
| Metric labels | Title Case, from the vocabulary | Engagement rate |
| MCP tools | `module.verb_object` | `reputation.open_case` |
| Subagents | `agent.subagent` | `host.recovery` |
| Use cases | verb + object | `openRecoveryCase` |

## Commits and pull requests

- Commits with Conventional Commits: `feat(signals): rebuild metrics idempotently`.
- One pull request per logical change, with a description of what and why.
- If the change touches an architecture decision, link or create its ADR.
- If it changes an event contract, a signal type, a metric or an MCP tool, update its page in this documentation, in both languages.
