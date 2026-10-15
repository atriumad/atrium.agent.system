---
id: 0019-llm-provider-behind-a-port
sidebar_position: 20
title: "0019 · The language model sits behind a port"
sidebar_label: "0019 · The language model sits behind a port"
description: "The language model sits behind a port"
---

# ADR 0019: The language model sits behind a port

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-13 | Atrium · product and technology |

## Context

Sentiment reads what guests write in a survey. That needs a language model, and the provider will change: we start with a free model to build, and move to a paid one before real clients. Guests' words are third-party data.

## Decision

The use case depends on a `ResponseReader` port. The adapter lives in `apps/agents` and calls OpenRouter through the Vercel AI SDK, with the reading schema as a Zod schema. The provider is a model id in `SENTIMENT_MODEL`. The model used is stored with every reading (`read_model`). Only the rating, the two chosen options and the comment reach the model: never a guest id, name or contact. The model can only raise a severity, never lower one or close a case.

Real clients' responses go only to a paid model, or to a model whose data policy has been checked and recorded here. The worker refuses a `:free` model unless `NODE_ENV` is `development` or `test`, or `SENTIMENT_ALLOW_FREE=true`; an unset `NODE_ENV` counts as production.

## Consequences

- Changing provider changes a string, not the module.
- A free model that rate-limits or fails leaves responses unread; Recovery still works from the rating.
- A reading call holds one database transaction for at most 15 seconds.
- Agents run in their own service, called by the worker ([0020](./0020-agents-in-their-own-service)); events and retries stay on pg-boss ([0006](./0006-events-with-pg-boss)). The variables in this ADR are now `HOST_LLM_API_KEY`, `HOST_MODEL_*` and `HOST_ALLOW_FREE`.
- Before enabling a model for real clients, run the golden and hostile cases once against that model (`bun apps/agents/scripts/eval-sentiment.ts` with `OPENROUTER_API_KEY` and `SENTIMENT_MODEL` set) and record the model and its data policy in this ADR. The live SDK call has not been exercised against a real provider yet.

## Discarded alternatives

- Calling the provider from inside Recovery: it would make cases depend on an outside service.
- Vercel Functions or Queues for agents: they would replace the transactional queue of ADR 0006.
- Keyword lists per client (the legacy way): brittle and maintained by hand.
