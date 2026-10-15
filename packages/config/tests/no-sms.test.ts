import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const ROOTS = ["apps", "modules", "packages"];
// Past migrations are history; the docs are checked by the docs build and their own test.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "build",
  ".docusaurus",
  "migrations",
  "docs",
  "i18n",
  ".turbo",
]);
const EXTENSIONS = [".ts", ".tsx", ".md", ".json", ".yaml", ".yml"];
// The tests that check for SMS have to name it.
const SELF_FILES = new Set([
  "packages/config/tests/no-sms.test.ts",
  "packages/config/tests/no-sms-docs.test.ts",
  "modules/core/tests/email-only.test.ts",
]);
const PATTERN = /sms|twilio|10dlc/i;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* files(path);
    } else if (EXTENSIONS.some((e) => name.endsWith(e))) {
      yield path;
    }
  }
}

describe("SMS is gone from the code", () => {
  test("no source, test, manifest or agent note mentions SMS, Twilio or 10DLC", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(join(ROOT, root))) {
        const rel = relative(ROOT, file);
        if (SELF_FILES.has(rel)) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (PATTERN.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
