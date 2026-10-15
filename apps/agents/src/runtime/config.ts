// apps/agents/src/runtime/config.ts
type Env = Record<string, string | undefined>;

/** What the Host needs to reach a model: one key for the whole agent, a model per subagent. */
export type HostConfig = {
  apiKey: string | undefined;
  defaultModel: string | undefined;
  env: Env;
};

export function hostConfigFromEnv(env: Env): HostConfig {
  return {
    apiKey: env.HOST_LLM_API_KEY || undefined,
    defaultModel: env.HOST_MODEL_DEFAULT || undefined,
    env,
  };
}

/** `host.sentiment` reads `HOST_MODEL_SENTIMENT`; anything unset falls back to the default model. */
export function modelFor(config: HostConfig, subagent: string): string | undefined {
  const suffix = subagent
    .replace(/^host\./, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  return config.env[`HOST_MODEL_${suffix}`] || config.defaultModel || undefined;
}

/**
 * Real clients' guests never go to a free model by accident. Fails closed: nothing in the repo sets
 * NODE_ENV, so an unset one counts as production.
 */
export function assertModelAllowed(model: string, env: Env): void {
  if (!model.endsWith(":free")) return;
  if (env.HOST_ALLOW_FREE === "true") return;
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return;
  throw new Error(
    `The model ${model} is a free model. It is refused unless NODE_ENV is development or test, or HOST_ALLOW_FREE=true is set on purpose.`,
  );
}
