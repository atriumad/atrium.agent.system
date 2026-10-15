import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const DOCS = [join(ROOT, "apps/docs/docs"), join(ROOT, "apps/docs/i18n")];
const PATTERN = /sms|twilio|10dlc/i;
// History and the decision that retires the topic.
const ALLOWED = [
  "adr/0010-email-only-notifications.md",
  "adr/0017-twilio-email-and-sms.md",
  "adr/0021-resend-email-no-sms.md",
  "adr/index.md",
];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (name.endsWith(".md") || name.endsWith(".mdx")) yield path;
  }
}

describe("SMS is gone from the documentation", () => {
  test("only the ADRs that record the history mention SMS, Twilio or 10DLC", () => {
    const hits: string[] = [];
    for (const dir of DOCS) {
      for (const file of files(dir)) {
        const rel = relative(ROOT, file);
        if (ALLOWED.some((a) => rel.endsWith(a))) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            // The ADR file name is fixed by the spec and contains "sms"; links to it are allowed.
            if (PATTERN.test(line.replaceAll("0021-resend-email-no-sms", "")))
              hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
