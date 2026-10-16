// apps/agents/src/runtime/model.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { assertModelAllowed } from "./config";
import type { UsageMeter } from "./meter";

/**
 * The language model, behind a port. Docs: ADR 0019. A subagent asks for a typed object and gets
 * the object, the model that wrote it and the tokens it cost. It never chooses tools.
 */
export type ModelRequest<T> = {
  subagent: string;
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Cap on the answer's tokens. Defaults to 1024 in the adapter. */
  maxOutputTokens?: number;
};

export type ModelPort = {
  generate<T>(
    request: ModelRequest<T>,
  ): Promise<{ object: T; model: string; usage: { tokens: number } }>;
};

type GenerateArgs = {
  model: unknown;
  schema: unknown;
  system: string;
  prompt: string;
  abortSignal: AbortSignal;
  maxRetries: number;
  maxOutputTokens: number;
};
type Generate = (
  args: GenerateArgs,
) => Promise<{ object: unknown; usage?: { totalTokens?: number } }>;

export type ModelFailureKind = "rate_limited" | "timeout" | "provider_error" | "invalid_output";

/**
 * The only error the model adapter lets out. The SDK's own errors carry the guest's comment (request
 * body, response body, the text that failed validation), and the queue stores a failed job's error
 * where erasure cannot reach it. So this one holds a kind and a status, and nothing else.
 */
export class ModelUnavailableError extends Error {
  readonly kind: ModelFailureKind;
  readonly status?: number;
  constructor(kind: ModelFailureKind, status?: number) {
    super(`model unavailable: ${kind}${status === undefined ? "" : ` (${status})`}`);
    this.name = "ModelUnavailableError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

function classify(error: unknown): ModelUnavailableError {
  const e = (typeof error === "object" && error !== null ? error : {}) as Record<string, unknown>;
  const name = typeof e.name === "string" ? e.name : "";
  const code = [e.statusCode, e.status].find((v) => typeof v === "number") as number | undefined;
  if (name === "TimeoutError" || name === "AbortError") return new ModelUnavailableError("timeout");
  if (code === 429) return new ModelUnavailableError("rate_limited", 429);
  if (code !== undefined) return new ModelUnavailableError("provider_error", code);
  if (
    name === "AI_NoObjectGeneratedError" ||
    name === "NoObjectGeneratedError" ||
    name === "AI_NoOutputGeneratedError" ||
    name === "NoOutputGeneratedError" ||
    name === "AI_TypeValidationError"
  ) {
    return new ModelUnavailableError("invalid_output");
  }
  return new ModelUnavailableError("provider_error");
}

/**
 * `generateObject` is deprecated in ai v7; `generateText` with `Output.object` is its replacement.
 * It returns the structured value in `output`; the seam keeps the `{ object }` shape.
 */
const generateWithSdk: Generate = async (args) => {
  const result = await generateText({
    model: args.model as Parameters<typeof generateText>[0]["model"],
    system: args.system,
    prompt: args.prompt,
    abortSignal: args.abortSignal,
    maxRetries: args.maxRetries,
    maxOutputTokens: args.maxOutputTokens,
    output: Output.object({ schema: args.schema as Parameters<typeof Output.object>[0]["schema"] }),
  });
  const usage = result.usage as { totalTokens?: number } | undefined;
  return { object: result.output, usage: { totalTokens: usage?.totalTokens ?? 0 } };
};

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export type OpenRouterConfig = {
  apiKey: string;
  meter?: UsageMeter;
  timeoutMs?: number;
  /** Where the free-model guard reads its variables. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** Replaces the SDK call. Tests use it. */
  generate?: Generate;
};

export function openRouterModel(config: OpenRouterConfig): ModelPort {
  const provider = createOpenRouter({ apiKey: config.apiKey });
  const generate = config.generate ?? generateWithSdk;
  return {
    async generate(request) {
      // The guard lives in the port so every subagent gets it, not only the one main.ts checks.
      assertModelAllowed(request.model, config.env ?? process.env);
      let result: Awaited<ReturnType<Generate>>;
      try {
        result = await generate({
          model: provider(request.model),
          schema: request.schema,
          system: request.system,
          prompt: request.prompt,
          // The queue retries; the SDK must not hold the transaction open on its own retries.
          abortSignal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
          maxRetries: 0,
          maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        });
      } catch (error) {
        throw classify(error);
      }
      const tokens = result.usage?.totalTokens ?? 0;
      if (tokens > 0) config.meter?.add(tokens);
      const parsed = request.schema.safeParse(result.object);
      if (!parsed.success) throw new ModelUnavailableError("invalid_output");
      return { object: parsed.data, model: request.model, usage: { tokens } };
    },
  };
}
