import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  decide,
  defineTool,
  type Facts,
  ManifestError,
  parseManifest,
  reasonField,
  uncoveredRules,
} from "../src";

const MANIFEST = `
id: host.recovery
version: 3
engine: reputation
goal: "Measure the experience and win back dissatisfied guests"
tools:
  reputation.list_responses:    { level: 4 }
  reputation.open_case:         { level: 4, max_per_day: 2 }
  reputation.draft_reply:       { level: 2 }
  reputation.publish_reply:     { level: 3 }
  reputation.remove_it:         { level: 1 }
  notify.send_morning:          { level: 4, hours: { from: 9, to: 21 } }
scopes: [reputation:read, reputation:write]
never:
  - make the review link depend on the rating
  - write to a guest without recorded consent
untrusted_input: [response.comment]
escalate_to: account_manager
kill_switch: per_client
evals: evals/recovery/*.yaml
`;
const manifest = parseManifest(MANIFEST);

const facts = (overrides: Partial<Facts> = {}): Facts => ({
  agentActive: true,
  featureLevel: "full",
  usageToday: 0,
  now: new Date("2026-10-06T17:00:00Z"),
  localHour: 12,
  ...overrides,
});

const tool = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  writes: true,
  scopes: ["reputation:write"],
  ...extra,
});
const run = (name: string, f: Facts = facts(), extra: Record<string, unknown> = {}) =>
  decide({ manifest, tool: tool(name, extra), callInput: {}, facts: f });

describe("the six steps, in order", () => {
  test("1 · a switched-off agent is rejected first, whatever else is wrong", () => {
    const verdict = run(
      "reputation.nowhere",
      facts({ agentActive: false, featureLevel: "locked", usageToday: 99 }),
    );
    expect(verdict).toMatchObject({ decision: "reject", step: 1 });
  });

  test("2 · a tool outside the manifest is rejected, then a locked module", () => {
    expect(run("reputation.nowhere")).toMatchObject({ decision: "reject", step: 2 });
    expect(run("reputation.open_case", facts({ featureLevel: "locked" }))).toMatchObject({
      decision: "reject",
      step: 2,
    });
    expect(run("reputation.open_case", facts({ featureLevel: "basic" })).decision).toBe("execute");
  });

  test("3 · a scope the manifest does not grant is rejected", () => {
    const verdict = run("reputation.open_case", facts(), {
      scopes: ["guests:contact_if_consented"],
    });
    expect(verdict).toMatchObject({ decision: "reject", step: 3 });
    expect(verdict.reason).toContain("guests:contact_if_consented");
  });

  test("4 · a per-day limit stops the call that would exceed it", () => {
    expect(run("reputation.open_case", facts({ usageToday: 1 })).decision).toBe("execute");
    expect(run("reputation.open_case", facts({ usageToday: 2 }))).toMatchObject({
      decision: "reject",
      step: 4,
    });
  });

  test("4 · an hours window is local, from inclusive to exclusive", () => {
    const hours = (h: number) =>
      run("notify.send_morning", facts({ localHour: h }), { scopes: ["reputation:write"] })
        .decision;
    expect([8, 9, 20, 21].map(hours)).toEqual(["reject", "execute", "execute", "reject"]);
  });

  test("5 · a never rule that fires rejects, and says which", () => {
    const never = [
      {
        rule: "write to a guest without recorded consent",
        check: () => "the guest has not agreed",
      },
    ];
    const verdict = run("reputation.open_case", facts(), { never });
    expect(verdict).toMatchObject({ decision: "reject", step: 5 });
    expect(verdict.reason).toContain("write to a guest without recorded consent");
    expect(verdict.reason).toContain("the guest has not agreed");
  });

  test("5 · a never rule that does not fire lets the call through", () => {
    const never = [{ rule: "x", check: () => null }];
    expect(run("reputation.open_case", facts(), { never }).decision).toBe("execute");
  });

  test("an earlier step wins over a later one", () => {
    const verdict = run("reputation.open_case", facts({ usageToday: 5 }), {
      never: [{ rule: "r", check: () => "bad" }],
    });
    expect(verdict).toMatchObject({ decision: "reject", step: 4 });
  });
});

describe("6 · levels", () => {
  test("level 4 executes, 3 asks for approval, 2 drafts, 1 refuses a write", () => {
    expect(run("reputation.open_case").decision).toBe("execute");
    expect(run("reputation.publish_reply").decision).toBe("approval");
    expect(run("reputation.draft_reply").decision).toBe("draft");
    expect(run("reputation.remove_it")).toMatchObject({ decision: "reject", step: 6 });
  });

  test("a tool that only reads runs at any level, even 1", () => {
    for (const name of [
      "reputation.remove_it",
      "reputation.publish_reply",
      "reputation.draft_reply",
    ]) {
      expect(run(name, facts(), { writes: false }).decision).toBe("execute");
    }
  });
});

describe("rules need checks", () => {
  const withCheck = (rule: string) => ({
    name: "reputation.open_case",
    never: [{ rule, check: () => null }],
  });

  test("a manifest rule with no check anywhere is reported", () => {
    expect(
      uncoveredRules(manifest, [withCheck("make the review link depend on the rating")]),
    ).toEqual(["write to a guest without recorded consent"]);
  });

  test("covered rules are not reported, and checks on tools outside the manifest do not count", () => {
    const both = [
      withCheck("make the review link depend on the rating"),
      {
        name: "reputation.list_responses",
        never: [{ rule: "write to a guest without recorded consent", check: () => null }],
      },
    ];
    expect(uncoveredRules(manifest, both)).toEqual([]);
    const foreign = [
      {
        name: "growth.other",
        never: [{ rule: "write to a guest without recorded consent", check: () => null }],
      },
    ];
    expect(uncoveredRules(manifest, foreign)).toContain(
      "write to a guest without recorded consent",
    );
  });
});

describe("manifests", () => {
  const broken = (change: (m: Record<string, unknown>) => void) => {
    const base = JSON.parse(JSON.stringify({ ...manifest }));
    change(base);
    return () => parseManifest(JSON.stringify(base));
  };

  test("a valid manifest parses with its levels and limits", () => {
    expect(manifest.id).toBe("host.recovery");
    expect(manifest.tools["reputation.open_case"]).toEqual({ level: 4, max_per_day: 2 });
  });

  test("a missing never list, a bad level, an unknown field or a bad id are refused", () => {
    expect(broken((m) => (m.never = []))).toThrow(ManifestError);
    expect(
      broken((m) => ((m.tools as Record<string, unknown>)["reputation.x"] = { level: 5 })),
    ).toThrow(ManifestError);
    expect(broken((m) => (m.surprise = true))).toThrow(ManifestError);
    expect(broken((m) => (m.id = "Host Recovery"))).toThrow(ManifestError);
    expect(broken((m) => (m.tools = {}))).toThrow(ManifestError);
    expect(broken((m) => (m.kill_switch = "sometimes"))).toThrow(ManifestError);
  });

  test("bad hours and bad YAML say what is wrong", () => {
    expect(
      broken(
        (m) =>
          ((m.tools as Record<string, unknown>)["notify.x"] = {
            level: 4,
            hours: { from: 12, to: 9 },
          }),
      ),
    ).toThrow("hours");
    expect(() => parseManifest("id: [unclosed")).toThrow("not valid YAML");
  });
});

describe("defineTool", () => {
  const base = {
    description: "d",
    output: z.object({}),
    feature: "reputation" as const,
    scopes: ["reputation:write"],
    handler: async () => ({}),
  };

  test("a tool that writes must take a reason", () => {
    expect(() =>
      defineTool({
        ...base,
        name: "reputation.open_case",
        writes: true,
        input: z.object({ id: z.string() }),
      }),
    ).toThrow("needs a reason");
    expect(() =>
      defineTool({
        ...base,
        name: "reputation.open_case",
        writes: true,
        input: z.object({ id: z.string(), reason: reasonField }),
      }),
    ).not.toThrow();
  });

  test("a tool that only reads needs none, and the name must be module.tool", () => {
    expect(() =>
      defineTool({ ...base, name: "reputation.list", writes: false, input: z.object({}) }),
    ).not.toThrow();
    expect(() =>
      defineTool({ ...base, name: "OpenCase", writes: false, input: z.object({}) }),
    ).toThrow("module.tool");
  });

  test("a reason is 10 to 280 characters", () => {
    expect(reasonField.safeParse("too short").success).toBe(false);
    expect(reasonField.safeParse("a perfectly good reason").success).toBe(true);
    expect(reasonField.safeParse("x".repeat(281)).success).toBe(false);
  });
});
