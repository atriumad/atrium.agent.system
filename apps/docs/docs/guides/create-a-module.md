---
sidebar_position: 4
title: "Create a module"
description: "Steps to add a module with its standard shape."
---

# Create a *module*

1. **Write the module's page first** in `docs/modules/` with: what it does, entry points, entities, states, MCP tools and events.
2. **Create the folder** with the [standard shape](../architecture/repository): `domain/`, `application/`, `infra/`, `http/`, `jobs/`, `mcp/`, `agents/`, `migrations/`, `tests/`.
3. **Define the Postgres schema** with the module's name and its first migration. Every table carries `client_id`.
4. **Write the domain** with tests before the infrastructure.
5. **Expose the use cases** through `http/` and `mcp/`; never logic in those layers.
6. **Declare the events** it publishes in `@atrium/contracts` with a version and examples.
7. **Register the feature flag** of the module in Core and place it in the [access matrix](../product/packages-and-access).
8. **Add the dependency rules**: the module may not import other modules.
9. **Register its metrics** in the metric registry, if it produces any ([Add a metric](./add-a-metric)).
10. **Mount the routes** in `apps/api` and the consumers in `apps/worker`.
11. **Meet the [definition of done](./definition-of-done)** before opening the final pull request.
