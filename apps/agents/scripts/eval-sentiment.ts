// apps/agents/scripts/eval-sentiment.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Reading } from "@atrium/reputation";
import { parse } from "yaml";
import { readerFromEnv } from "../src/reader";

const ORDER = ["none", "low", "medium", "high"];
const reader = readerFromEnv(process.env);
if (!reader) throw new Error("set OPENROUTER_API_KEY and SENTIMENT_MODEL");

const file = join(import.meta.dir, "../../../modules/reputation/evals/sentiment/cases.yaml");
const cases = parse(readFileSync(file, "utf8")) as {
  name: string;
  input: Parameters<typeof reader.read>[0];
  expect: Record<string, unknown>;
}[];

let failed = 0;
for (const c of cases) {
  const got = Reading.parse(await reader.read(c.input));
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
