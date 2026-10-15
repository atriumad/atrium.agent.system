---
id: 0020-agents-in-their-own-service
sidebar_position: 21
title: "0020 · Agents live in their own service"
sidebar_label: "0020 · Agents live in their own service"
description: "Agents live in their own service"
---

# ADR 0020: Agents live in their own service

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-15 | Atrium · product and technology |

## Context

Host's subagents ran inside the worker, wired to events by the module. That gave the agents no home of their own: the model key, the gateway and the agents' code sat in the worker, and every new agent would have been wired the same way. Host needs its own model key, and its subagents need to be called by the worker, the API and later modules.

## Decision

`apps/agents` is a service. It holds the gateway, the model runtime and a registry of tasks, and it is the only process with the Host's key (`HOST_LLM_API_KEY`). Callers use a typed client from `packages/contracts` over HTTP (`POST /v1/tasks/:name`, bearer token). A caller sends ids and a reason; the service reads the data and applies the effects through the gateway, so the policy engine, the limits, the kill switch and the audit log cover the whole task.

The model does typed tasks: it returns an object that matches a schema, and the code decides what to do with it. It never chooses tools. A model is chosen per subagent (`HOST_MODEL_<SUBAGENT>`, with `HOST_MODEL_DEFAULT` behind it), behind the port of [0019](./0019-llm-provider-behind-a-port).

Manifests and tools stay in the modules. The worker keeps the event consumers and the cron, and each one only asks for a task.

## Consequences

- One more process to run, with database access bounded by the gateway, the policy engine and RLS.
- A policy refusal comes back as a value and is not retried. A provider or network failure fails the call, and pg-boss retries it.
- A new agent adds tasks to the registry and a contract entry; the server does not change.
- The model call still runs inside the tool's transaction, for at most 15 seconds and with no row lock, as 0019 accepted. A read tool and an apply tool can split it later.
- The variables `OPENROUTER_API_KEY`, `SENTIMENT_MODEL` and `SENTIMENT_ALLOW_FREE` are replaced by `HOST_LLM_API_KEY`, `HOST_MODEL_*` and `HOST_ALLOW_FREE`.
- The agents service now needs `PUBLIC_BASE_URL` (and optionally `ADMIN_BASE_URL`), which the worker no longer reads. Outside development and test it refuses to start without `PUBLIC_BASE_URL`.
- The agents service must run on a private network without a public domain: the bearer token travels in the clear unless `AGENTS_URL` is https.

## Discarded alternatives

- Keeping the agents in the worker: no home for the key, and each agent wired by hand.
- A queue between the worker and the agents: it does not serve a request from a screen that needs the answer now.
- A tool-use loop for every subagent: harder to test and to bound; it can be added to a subagent that needs it.
