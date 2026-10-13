import { describe, expect, test } from "bun:test";
import { uncoveredRules } from "@atrium/policy";
import { loadHostManifests, reputationTools } from "@atrium/reputation";

describe("host.sentiment manifest", () => {
  const manifests = loadHostManifests();
  const sentiment = manifests.find((m) => m.id === "host.sentiment");
  const tools = reputationTools({ publicBaseUrl: "https://survey.example.test" });

  test("loads, with one tool and no way to open a case or notify", () => {
    expect(sentiment).toBeDefined();
    expect(Object.keys(sentiment?.tools ?? {})).toEqual(["reputation.read_response"]);
    expect(sentiment?.untrusted_input).toEqual(
      expect.arrayContaining(["response.comment", "response.best_part", "response.improve"]),
    );
  });

  test("every never rule has code behind it", () => {
    for (const manifest of manifests) {
      expect(
        uncoveredRules(manifest, tools as unknown as Parameters<typeof uncoveredRules>[1]),
      ).toEqual([]);
    }
  });

  test("the review link never depends on the reading", () => {
    expect(sentiment?.never).toContain("make the review link depend on the rating or the reading");
  });
});
