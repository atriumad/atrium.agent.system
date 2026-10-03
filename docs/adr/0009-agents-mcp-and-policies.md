---
id: 0009-agents-mcp-and-policies
sidebar_position: 10
title: "0009 · Agents with MCP tools and a policy engine"
sidebar_label: "0009 · Agents with MCP tools and a policy engine"
description: "Agents with MCP tools and a policy engine"
---

# ADR 0009: Agents with MCP tools and a policy engine

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Agents must operate the system autonomously following rules they cannot step outside of. Instructions in a prompt are not verifiable.

## Decision

Each module exposes its use cases as MCP tools. Each subagent has a versioned manifest (tools, levels, limits, `never` rules). An MCP gateway identifies the subagent and a policy engine decides on every call: execute, ask for approval or reject. Everything is audited.

## Consequences

- The rules live in code and are tested.
- An agent cannot do anything that a person with that role cannot.
- Cost: building the gateway, engine and audit in F0.

## Discarded alternatives

- Giving access to the API or the database: no verifiable limits.
- Prompt instructions only: they cannot be guaranteed.
