# The Host runs in its own service: design

Date: 2026-10-15
Status: draft for review
Part 1 of the Host agent. Later parts: reviews coming in, Echo, the approval queue.

## Goal

Make `apps/agents` the home of the agents. Other apps and modules consume them with HTTP calls. The Host gets its own LLM key, and its subagents run from it for specific tasks. The first part builds that runtime and moves the three existing subagents onto it: Sentiment, Recovery and Ask. Behavior does not change; where the agents run does.

## What was asked, and what I assumed

Asked: build the Host as the documentation defines it (Echo, Ask, Recovery, Sentiment), adjusting as decisions are made. The model is not only for Sentiment. The Host has its own API key and its subagents run from it. Agents live in `apps/agents`; the other apps and modules call them, and so will future modules.

Decided in this design session:
- **Part 1 is the runtime**, not Echo. Echo needs the runtime and also needs reviews coming in, which do not exist yet.
- **The model does typed tasks; the code decides.** The model returns an object that matches a Zod schema. It never chooses tools. A tool-use loop is a later option.
- **HTTP with typed contracts.** Not a queue.
- **The service reads the data and applies the effects**, through the gateway. A caller sends ids and a reason.
- **OpenRouter, one model per subagent**, behind a port. One Host key shared by its subagents.
- **All three existing subagents move** so only one pattern remains.

Assumption to confirm: the key belongs to the Host, so a future agent (for example Maître) gets its own key. No per-subagent keys.

## Where things are today

- `apps/agents` holds the gateway (`gateway.ts`) and Sentiment's model adapter (`reader.ts`). It is a library, not a process.
- `modules/reputation/agents/` holds the agent definitions: the manifests (`*.agent.yaml`), and the code in `ask.ts`, `recovery.ts`, `sentiment.ts` that subscribes to events and calls the gateway.
- `apps/worker` builds the gateway and runs those consumers and the Ask cron. ADR 0019 says agents keep running in the worker.
- The audit log already has `cost_tokens` and `cost_cents`; nothing fills them.

## Architecture

```
worker (events, cron) ─┐
api (a screen action)  ├─ HTTP + service token ─► apps/agents (process)
future modules ────────┘                          ├ task registry (Zod in/out)
                                                  ├ runtime: ModelPort, Host key, model per subagent, cost
                                                  ├ gateway + policy + audit (exist)
                                                  └ tools → module use cases (in process)
```

Boundaries:
- `apps/agents` imports the modules, as it does now, and is the only process that holds `HOST_LLM_API_KEY`, calls a model and runs a tool.
- Callers never import `apps/agents`. They use a typed client from `packages/contracts`, so dependency-cruiser stays satisfied.
- Manifests and tools stay in the modules. What moves is the code that reacts to events and decides to call a tool.

## Components

### Contract (`packages/contracts`)

`agent-tasks.ts` declares each task's name, input and output as Zod schemas. `agents-client.ts` is a small client over `fetch`: `callTask(name, { clientId, locationId?, input })` returns the typed `{ decision, result?, reason? }`. It sends the service token, throws on any non-2xx answer; a 200 is always a value (a policy refusal is a 200 `rejected`). It has no dependency beyond Zod.

### Task registry (`apps/agents/src/tasks/`)

A task is `defineTask({ name, agent, input, output, run })`. `run` gets a context with the gateway, the model port, a clock and a logger. One file per subagent. A new module adds its tasks by registering them; the server does not change.

| Task | Subagent | Called by | What it does |
| --- | --- | --- | --- |
| `sentiment.read` | `host.sentiment` | consumer of `survey.response.submitted` | Reads the response, calls the model, stores the labels |
| `recovery.evaluate` | `host.recovery` | consumers of `survey.response.submitted` and `survey.response.read` | Decides to open or raise a case; deterministic |
| `ask.schedule` | `host.ask` | consumer of `visit.identified` | Schedules the review request |
| `ask.send_due` | `host.ask` | cron, every minute | Lists the due requests and sends them, one gateway call each |

Every effect still goes through the gateway: the kill switch, the package gate, the daily limits, the `never` rules and the audit apply exactly as now. The module use cases do not change.

### Runtime (`apps/agents/src/runtime/`)

- **`ModelPort.generate({ subagent, system, prompt, schema })`** returns `{ object, model, usage }`. The OpenRouter adapter uses the AI SDK, as the reader does now. `reader.ts` is rebuilt on it; Sentiment's reader becomes a thin use of the port.
- **Configuration:** `HOST_LLM_API_KEY`, `HOST_MODEL_DEFAULT`, and an optional `HOST_MODEL_<SUBAGENT>` per subagent (for example `HOST_MODEL_SENTIMENT`). `OPENROUTER_API_KEY` and `SENTIMENT_MODEL` are removed.
- **Free-model guard:** `assertModelAllowed` stays and applies to every subagent. A `:free` model is refused unless `NODE_ENV` is `development` or `test`, or `HOST_ALLOW_FREE=true` (it replaces `SENTIMENT_ALLOW_FREE`); an unset `NODE_ENV` counts as production.
- **Untrusted text:** a shared helper wraps third-party text in a delimited data block and strips any attempt to close it. Every task that sends a guest's words uses it.
- **Cost:** after each call the runtime writes the tokens to the audit entry's `cost_tokens` through a per-call usage meter. The model id is not repeated there: it already sits on the response (`read_model`). `cost_cents` is left empty until a price table exists.
- **Budget:** the manifest's `max_per_day` stays the per-subagent cap. A call has a timeout (15 s, as now) and a maximum output size.

### Service (`apps/agents/src/server.ts`, `main.ts`)

Hono. `POST /v1/tasks/:name` with `Authorization: Bearer <AGENTS_SERVICE_TOKEN>`. Body `{ clientId, locationId?, input }`. `GET /health`. The service builds the gateway from the manifests and tools as the worker does today, and listens on `AGENTS_PORT` (default 3005).

| Answer | When |
| --- | --- |
| 200 `{ decision, result?, reason? }` | The task ran, or the gateway decided (`executed`, `drafted`, `rejected`) |
| 400 | The input does not match the task's schema |
| 401 | Missing or wrong service token |
| 404 | Unknown task |
| 502 `{ kind, status? }` | The provider failed or timed out. No guest text in the body |

### Worker (`apps/worker`)

It stops building the gateway and running agents. Its consumers keep their names, events and feature gates, and each handler calls one task through the client. A 502 or a network error throws, so pg-boss retries. A 200 with `rejected` is a decision and does not throw. Its cron job calls `ask.send_due`. It no longer needs the model key.

## Data flow: a survey response

1. The guest submits. The API stores the response and publishes `survey.response.submitted`.
2. The worker's two consumers call `recovery.evaluate` and `sentiment.read` with the ids.
3. `recovery.evaluate` opens a case from the rating and alerts people, as today.
4. `sentiment.read` asks the tool to read the response. The tool calls the model inside its own transaction, bounded to 15 s with no row lock held, as ADR 0019 accepts, then stores the labels. Splitting it into a read tool and an apply tool is possible later. With a serious reading it publishes `survey.response.read`, and the worker calls `recovery.evaluate` again, which may raise the case.
5. Without a key, step 4 ends in `rejected` ("model not configured") and is not retried; the case from step 3 stands.

## Errors and rules kept

- Provider errors carry a kind and a status, never the guest's words (existing rule, kept).
- A refusal by policy is not retried. A provider failure is.
- The model can only raise a severity, never lower it or close a case (existing rule, kept in the tool).
- The review link and who is asked for a review never depend on a reading or a rating (ADR 0018).

## Testing

- **Tasks:** the current Sentiment, Recovery and Ask tests are ported to run against the registry with a fake `ModelPort`. Behavior must match.
- **Contract:** one test checks that every task in the contract has a registered implementation and the other way round.
- **HTTP:** 401 without a token, 400 on a bad body, 404, 502 mapping, and `rejected` without a key.
- **Worker:** consumers call the client; a provider failure throws, a rejection does not.
- **Evals:** `eval-sentiment.ts` runs on the port. It is run once against the real model before real clients, and the model and its data policy are recorded in the new ADR.
- **Live:** repeat the order → email → survey → case → resolved walk-through, with REA, on the running system.

## Rollout

- A new `agents` service on Railway with `HOST_LLM_API_KEY`, the model variables, `AGENTS_SERVICE_TOKEN` and the application database role (RLS through `withTenant`). The worker and the API receive `AGENTS_URL` and the token.
- No data migration. The old variables are replaced; there are no real clients yet.
- Local development and the seed add the `agents` service; `.env.example` lists the new names.

## Documentation (English and Spanish)

- **ADR 0020:** agents live in their own service. It replaces the clause "agents keep running in `apps/worker`" of ADR 0019, which gets a note pointing here.
- `agents/host`: the real levels of Recovery and Sentiment (both run at level 4 today), and Echo marked as not built.
- `architecture/agents-and-mcp`: the service, the registry and the runtime.
- `guides/create-a-subagent`: how to register a task.
- `guides/local-development`: the new service and variables.

## Risks accepted

- One more process to run, and it now has database access. The gateway, the policy engine and RLS bound it.
- Latency of one HTTP hop on each event. The models already dominate it.
- `ask.send_due` makes one call that lists and sends, not one call per request.

## Out of this part

Echo and reviews coming in, the approval queue for level 3, the tool-use loop, the MCP transport in front of the gateway, daily theme grouping, price table for `cost_cents`, and the agents of other modules.

## Success

1. The walk-through works unchanged, and the worker holds no agent logic and no model key.
2. With the key and a model set, Sentiment stores its labels and the audit shows the model and tokens of each call.
3. Turning an agent off for a client stops its tasks in the service, and a policy refusal is not retried.
