---
sidebar_position: 6
title: "Add a connector"
description: "Bring a new provider into signals_daily."
---

# Add a *connector*

A connector moves a provider's data into `signals_daily`. Adding one never touches the agents or the screens.

1. **Write the source's row** in [Signals and sources](../data/signals-and-sources): what it emits, its cadence and whether it carries elements.
2. **Map the provider's fields** to signal rows. Every field becomes a `signal_type` from the enum; if one is missing, add the type to the enum and to the docs first.
3. **Build the N8N workflow** in `connectors/<provider>/`, with the provider's credentials from the secret manager, and export it to the repo.
4. **Call the ingestion API** with the connector's scoped token. The workflow never writes to the database.
5. **Choose the natural key** (`date`, `location_id`, `source`, `platform`, `element_id`, `signal_type`) so a re-run replaces the day.
6. **Record fixtures** of real payloads in `connectors/<provider>/fixtures/` and write the contract test that maps them to the expected rows.
7. **Register freshness:** report the last successful sync so the Platform and the Manager can show it.
8. **Write the manual fallback:** which daily-entry section covers the same signals.
9. **Update the pages:** [Integrations](../architecture/integrations) and the metric rows the new source feeds.
