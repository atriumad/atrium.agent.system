import { describe, expect, test } from "bun:test";
import { ACCENT_STYLE, LOYALTY_ACCENTS, StampGrid } from "../src/loyalty";
import { setup } from "./helpers";

const EXPECTED_INK = {
  lime: "text-charcoal-900",
  clay: "text-cream-100",
  charcoal: "text-cream-100",
  sage: "text-cream-100",
} as const;

describe("StampGrid tick ink", () => {
  for (const accent of LOYALTY_ACCENTS) {
    test(`${accent}: the filled stamp uses the accent's ink and no other text colour`, () => {
      const { container } = setup(
        <StampGrid required={3} filled={1} accent={accent} label="stamps" />,
      );
      const stamp = container.querySelector('[data-stamp="filled"]');
      expect(stamp).not.toBeNull();
      const classes = (stamp?.getAttribute("class") ?? "").split(/\s+/);
      expect(ACCENT_STYLE[accent].ink).toBe(EXPECTED_INK[accent]);
      expect(classes).toContain(EXPECTED_INK[accent]);
      const textColours = classes.filter((c) => c.startsWith("text-"));
      expect(textColours).toEqual([EXPECTED_INK[accent]]);
    });
  }
});
