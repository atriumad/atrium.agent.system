---
sidebar_position: 9
title: "Definition of done"
description: "When a piece of work is finished."
---

# Definition of *done*

A piece of work is done when it meets everything that applies:

- [ ] Green CI: types, Biome, dependency-cruiser and tests
- [ ] New tests for the new logic; `domain/` covered
- [ ] Migrations tested from scratch and on existing data
- [ ] Every new table with `client_id` and an isolation test
- [ ] Event, signal and MCP tool contracts with valid and invalid examples
- [ ] A new metric has its registry row, its golden case and its label
- [ ] A new connector has fixtures, freshness and a manual fallback
- [ ] Evals green if a subagent changes
- [ ] Accessible with keyboard and screen reader if it touches the interface
- [ ] Logs with `clientId` and module; errors visible in Sentry
- [ ] Documentation updated in both languages: module page, events, tools, metrics or ADR
- [ ] Reviewed by another person and tested in staging
