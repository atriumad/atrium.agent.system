import { describe, expect, test } from "bun:test";
import { planLoyalty } from "../scripts/seed-loyalty";

const locs = [
  { id: "a", clientId: "c1", name: "Casa Olivo Bellaire" },
  { id: "b", clientId: "c2", name: "Kiwi Cafe Auckland" },
];

describe("planLoyalty", () => {
  test("plans an active program for each location that has none", () => {
    const plan = planLoyalty(locs, new Set());
    expect(plan.map((p) => p.location.id)).toEqual(["a", "b"]);
    for (const p of plan) {
      expect(p.input.active).toBe(true);
      expect(p.input.stampsRequired).toBeGreaterThanOrEqual(2);
      expect(p.input.rewardLabel.length).toBeLessThanOrEqual(80);
    }
  });

  test("a location with a program is left alone, so a second run plans nothing", () => {
    expect(planLoyalty(locs, new Set(["a"])).map((p) => p.location.id)).toEqual(["b"]);
    expect(planLoyalty(locs, new Set(["a", "b"]))).toEqual([]);
  });
});
