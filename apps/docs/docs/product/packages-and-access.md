---
sidebar_position: 5
title: "Packages and access"
description: "What each package unlocks and how locked sections behave."
---

# Packages and *access*

Your package controls which sections are live. Locked pages stay visible so a client can see what the next package unlocks, and the data is already flowing: a section lights up the moment it is unlocked, with no setup and no waiting.

## The three packages

| Package | Price | What it is |
| --- | --- | --- |
| **Essential** | $1,800 / mo | Organic social, content studio and analytics. Discoverability on basic. The on-ramp |
| **Pillar 2** | $4,200 / mo | Adds full Discoverability, Reputation and verified Attribution. The core |
| **Pillar 3** | $6,800 / mo | Everything: Retention CRM, loyalty, SMS and email engines, full attribution |

## Access matrix

Per module: **Full**, **Basic** or **Locked**. Everyone gets Content, Analytics and organic Discoverability on Basic.

| Module | Essential | Pillar 2 | Pillar 3 |
| --- | --- | --- | --- |
| Content | Full | Full | Full |
| Analytics | Full | Full | Full |
| Discoverability | Basic | Full | Full |
| Reputation | Locked | Full | Full |
| Retention | Locked | Locked | Full |
| Attribution | Locked | Basic | Full |

## What a locked section shows

| Section | Unlocks with | The teaser lists |
| --- | --- | --- |
| Retention | Pillar 3 | Guestbook and segments, email campaigns, SMS campaigns, loyalty and automations |
| Attribution | Pillar 2 | Aware → trusted → visited → ordered, traced actions, where guests come from, channel mix |
| Growth | Pillar 2 | Campaign panels, launch queue, effort timeline, paid media |
| Management | Pillar 2 | Approval queue, posting calendar, content library |
| Benchmarks | Pillar 3 | You vs 10-mile bars, moat metrics, category rankings, forecasting |

Each teaser carries a call to action: "Ask your strategist."

## How access is enforced

- Access is computed once, from the client's package and the Core feature flags, and read by the Platform, the Mobile app, the Manager and the MCP gateway. A locked module has no tools for agents either.
- A locked section keeps ingesting data, so unlocking is instant.
- The Manager shows the same matrix per client ("Manage access") and the daily-entry log only offers the sections the package unlocks.

:::caution To reconcile
The Platform prototype gates by section (Pillar 2 unlocks Retention and Growth; only Benchmarks is locked), while the Manager matrix above locks Retention on Pillar 2. This page follows the Manager matrix. See [Open decisions](../plan/open-decisions).
:::
