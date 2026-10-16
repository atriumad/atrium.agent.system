// apps/agents/scripts/eval-sentiment.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Reading } from "@atrium/reputation";
import { parse } from "yaml";
import {
  assertModelAllowed,
  hostConfigFromEnv,
  modelFor,
  openRouterModel,
  sentimentReader,
} from "../src";

const ORDER = ["none", "low", "medium", "high"];
const config = hostConfigFromEnv(process.env);
const model = modelFor(config, "host.sentiment");
if (!config.apiKey || !model) {
  throw new Error("set HOST_LLM_API_KEY and HOST_MODEL_SENTIMENT (or HOST_MODEL_DEFAULT)");
}
assertModelAllowed(model, process.env);
const reader = sentimentReader(
  openRouterModel({
    apiKey: config.apiKey,
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  }),
  model,
);

const file = join(import.meta.dir, "../../../modules/reputation/evals/sentiment/cases.yaml");
const cases = parse(readFileSync(file, "utf8")) as {
  name: string;
  input: Parameters<typeof reader.read>[0];
  expect: Record<string, unknown>;
}[];

/** In production the queue retries a failed reading; here a free model's 502s would end the run. */
async function readWithRetries(input: Parameters<typeof reader.read>[0], attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await reader.read(input);
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.log(`retry ${attempt}/${attempts - 1}: ${(error as Error).message}`);
      await Bun.sleep(5000 * attempt);
    }
  }
}

let failed = 0;
for (const c of cases) {
  const got = Reading.parse(await readWithRetries(c.input));
  const e = c.expect as {
    safety?: boolean;
    sentiment?: string;
    concern_min?: string;
    concern_max?: string;
  };
  const rank = ORDER.indexOf(got.concern);
  const ok =
    (e.safety === undefined || got.safety === e.safety) &&
    (e.sentiment === undefined || got.sentiment === e.sentiment) &&
    (e.concern_min === undefined || rank >= ORDER.indexOf(e.concern_min)) &&
    (e.concern_max === undefined || rank <= ORDER.indexOf(e.concern_max));
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  ${JSON.stringify(got)}`);
  if (!ok) failed++;
}
console.log(`${cases.length - failed}/${cases.length} passed with ${reader.model}`);
process.exit(failed ? 1 : 0);
