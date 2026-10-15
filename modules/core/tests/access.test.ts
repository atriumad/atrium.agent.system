import { describe, expect, test } from "bun:test";
import { FEATURES, PACKAGES } from "@atrium/contracts";
import { ACCESS_MATRIX, isLive, resolveAccess, resolveLevel } from "../domain/access";

describe("access matrix", () => {
  test("every package defines every feature", () => {
    for (const pkg of PACKAGES) {
      expect(Object.keys(ACCESS_MATRIX[pkg]).sort()).toEqual([...FEATURES].sort());
    }
  });

  test("a higher package never has less access than a lower one", () => {
    const rank = { locked: 0, basic: 1, full: 2 } as const;
    for (const feature of FEATURES) {
      const levels = PACKAGES.map((pkg) => rank[ACCESS_MATRIX[pkg][feature]]);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
    }
  });

  test("matches the documented matrix", () => {
    expect(ACCESS_MATRIX.essential.discoverability).toBe("basic");
    expect(ACCESS_MATRIX.essential.reputation).toBe("locked");
    expect(ACCESS_MATRIX.pillar_2.retention).toBe("locked");
    expect(ACCESS_MATRIX.pillar_2.attribution).toBe("basic");
    expect(ACCESS_MATRIX.pillar_3.retention).toBe("full");
    for (const pkg of PACKAGES) {
      expect(ACCESS_MATRIX[pkg].content).toBe("full");
      expect(ACCESS_MATRIX[pkg].analytics).toBe("full");
    }
  });
});

describe("resolveLevel", () => {
  test("a client with no package has everything locked", () => {
    expect(Object.values(resolveAccess(null)).every((l) => l === "locked")).toBe(true);
  });

  test("the location override wins over the client override, which wins over the package", () => {
    expect(resolveLevel("essential", "reputation")).toBe("locked");
    expect(resolveLevel("essential", "reputation", { client: { reputation: "full" } })).toBe(
      "full",
    );
    expect(
      resolveLevel("essential", "reputation", {
        client: { reputation: "full" },
        location: { reputation: "locked" },
      }),
    ).toBe("locked");
  });

  test("an override can lock a feature the package unlocks", () => {
    expect(resolveLevel("pillar_3", "retention", { client: { retention: "locked" } })).toBe(
      "locked",
    );
  });

  test("an override with no package still applies", () => {
    expect(resolveLevel(null, "content", { client: { content: "basic" } })).toBe("basic");
  });
});

describe("isLive", () => {
  test("a basic module is live", () => {
    expect(isLive("basic")).toBe(true);
    expect(isLive("locked")).toBe(false);
  });
});
