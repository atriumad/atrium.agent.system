import { expect, test } from "bun:test";
import { createRequire } from "node:module";

type Rule = { name: string; severity: string };
const { forbidden } = createRequire(import.meta.url)("./dependency-cruiser.cjs") as {
  forbidden: Rule[];
};

test("module boundary rules are all errors", () => {
  expect(forbidden.map((rule) => rule.name)).toEqual([
    "no-cross-module",
    "no-cross-module-packages",
    "domain-is-pure",
    "entrypoints-use-application",
    "no-circular",
  ]);
  for (const rule of forbidden) expect(rule.severity).toBe("error");
});
