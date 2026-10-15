---
sidebar_position: 10
title: "Maintaining this documentation"
description: "Where this documentation lives and how it is updated."
---

# Maintaining this *documentation*

This documentation is a Docusaurus site that lives in `apps/docs` of the monorepo.

## Languages

English is the default language and lives in `docs/`. The Spanish translation lives in `i18n/es/docusaurus-plugin-content-docs/current/` with the same file names. When a page changes, update both.

## Structure

| Folder | Content |
| --- | --- |
| `docs/system` | Business model: engines, journey, services and packages, metrics and the Growth Score, risks |
| `docs/agents` | Agents, subagents, autonomy, interaction, scenarios, rules |
| `docs/data` | Signals, sources, metrics and scoring, storage and the pipeline, the manual worksheet |
| `docs/product` | Platform, Manager, Mobile, packages and access |
| `docs/architecture` | Principles, stack, repository, events, integrations, agents and MCP, security |
| `docs/modules` | Specification of each module |
| `docs/plan` | Phases, gates, tests, mandala and open decisions |
| `docs/adr` | Decision record |
| `docs/guides` | How to work in the repository |

## Rules

- **Code and documentation change in the same pull request.** If an event, a signal type, a metric, an MCP tool or a manifest changes, its page changes.
- **The glossary rules.** A new term is added to the [glossary](../system/glossary) before it is used.
- **Diagrams in Mermaid** inside the Markdown, so they are versioned with the text.
- **Relative internal links.** The build fails if a link breaks.

## Commands

```bash
bun install
bun run docs:dev     # from the repository root: http://localhost:3000 with reload (one language at a time)
bun run docs:build   # generates the static site in apps/docs/build for both languages and validates links
bun run --filter @atrium/docs serve   # serves the build locally, with the language switcher
```
