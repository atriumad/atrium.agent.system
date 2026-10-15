---
sidebar_position: 7
title: "Risks and compliance"
description: "Prohibited practices and design risks."
---

# Risks and *compliance*

Two practices from the original deck are corrected before building. The rest are design risks, each with its response.

| Risk | What is done |
| --- | --- |
| **Review gating.** Google policy forbids asking only satisfied guests for reviews. The original flow routed happy guests to Google and unhappy ones to a private channel | Everyone is asked for a review. The survey offers a private channel in addition, never instead. The review link is added by the system and never depends on the rating. See [ADR 0018](../adr/0018-no-review-gating) |
| **Consent.** A captured contact is not marketing permission; in the US CAN-SPAM requires an opt-out and a sender address for email | Consent log per channel and purpose, with date and source. No promotional send without consent. Opt-out in every message. Sources of opt-in (WiFi portal, QR, checkout) are recorded per contact |
| **Incentivized reviews.** Google prohibits offering rewards for reviews | Loyalty and offers are never conditioned on leaving a review |
| Guests' personal data | Role-based access, isolation per client, deletion on request, scrubbed from logs |
| Overstated attribution | Every attributed revenue shows its method. Estimates are labeled. Temporal correlation is never summed as attributed |
| Identity double counting | Identity stitching (pixel ID, POS match, phone or email) so a guest is counted once across sources |
| Agents outside their limits | MCP tools as the only door, policy engine, audit and kill switch. See [Agents and MCP](../architecture/agents-and-mcp) |
| Prompt injection from reviews or comments | Any text written by guests is untrusted data, never an instruction |
| Third-party dependency | Connectors per provider writing a normalized format; a manual log keeps working when a connector breaks |
| Benchmark quality | Benchmarks are only shown with a sample size; a thin radius sample hides the amber tick instead of guessing |

:::caution Not legal advice
Validate consent texts and message flows with a lawyer before the pilot.
:::
