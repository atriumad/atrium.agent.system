---
sidebar_position: 8
title: "Autonomy"
description: "The four autonomy levels and how to move up a level."
---

# Four levels. *Trust is earned.*

Each subagent starts at a level per tool and moves up as it accumulates evidence. Anything that speaks publicly in the client's voice, or spends the client's money, goes through a person until proven otherwise.

| Level | Name | What it means | Initial examples |
| --- | --- | --- | --- |
| <span className="pill pill--l1">1</span> | Observes | Measures and warns. Nothing goes outside | Radar, Schema, Pulse, Sentiment |
| <span className="pill pill--l2">2</span> | Proposes | Prepares drafts and plans. A person decides | Listings, Crave, Voices, Recovery, Capture, Strategist, Campaigner, Refresher |
| <span className="pill pill--l3">3</span> | With approval | Acts after an approval click | Front Door, Amplify, Echo, Letters, Narrator, Pacer |
| <span className="pill pill--l4">4</span> | Runs alone | Acts within rules already approved; everything stays in the log | Scorekeeper, Ask, Memory, Flows, Crown, Ledger |

## The level is per tool, not per agent

The same subagent can run a read tool on its own and need approval for a tool that writes. That is why the manifest declares the level tool by tool, and why the level in the tables above is the subagent's *initial* level for its main tool. See [Agents and MCP](../architecture/agents-and-mcp).

## Who approves

| Action | Approver |
| --- | --- |
| Public content and replies | Client owner or Account Manager |
| Paid launches, budget moves, price or menu claims | Account Manager (the COG requires it); the owner for amounts above the client's threshold |
| Negative-review replies | Account Manager, in writing |
| Listing changes (hours, menu) | Account Manager, after the restaurant confirms |
| Raising a subagent's level | Account Manager |

## How to move up a level

1. The subagent's **evals** are green for the tool.
2. There is **enough history** of unedited approvals (proposed threshold: 50 in a row, with no incidents).
3. The **client's Account Manager** approves it, and the change is recorded as a new manifest version.

Moving down is immediate: anyone with an agency role can do it, and the kill switch turns the subagent off for a client without deploying anything.
