---
sidebar_position: 11
title: "Common rules"
description: "What no agent does, at any autonomy level."
---

# What *no agent* does

Six rules that apply to all 30 agents and subagents, without exception. Each one has a check in code, not just a line in the prompt.

| Rule | How it is enforced |
| --- | --- |
| **Ask everyone for a review.** Never filter by experience | The system adds the review link in the template; no tool allows making it conditional. See [ADR 0018](../adr/0018-no-review-gating) |
| **No consent, no message** | The notification tool queries the consent log and rejects the send |
| **Every dollar says where it came from** | The attribution model requires a method; temporal correlation is not summed; estimates are labeled |
| **The public voice and the client's money pass through a person** | Tools that publish or spend start at level 3. Replies to negative reviews and paid launches stay at level 3 permanently |
| **If data is missing, it says so** | Tools return an explicit "no data"; evals penalize inventing numbers |
| **Everything stays in the log** | The MCP gateway audits every call before and after executing it |
