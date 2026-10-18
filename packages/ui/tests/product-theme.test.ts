import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dir, "../src");
const read = (name: string) => readFileSync(join(src, name), "utf8");
const product = read("tokens-product.css");
const brand = read("tokens.css");
const theme = read("theme.css");

const tokenIn = (css: string, name: string): string => {
  const hit = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  const value = hit?.[1]?.trim();
  if (!value) throw new Error(`--${name} is not defined`);
  return value;
};

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => channel(Number.parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe("the product theme", () => {
  test("loads after the brand tokens, so it wins", () => {
    const brandAt = theme.indexOf('@import "./tokens.css"');
    const productAt = theme.indexOf('@import "./tokens-product.css"');
    expect(brandAt).toBeGreaterThan(-1);
    expect(productAt).toBeGreaterThan(brandAt);
  });

  test("the page and the card are one cream, and the card is drawn by an ink outline", () => {
    expect(tokenIn(product, "surface-page")).toBe("#f8f5ed");
    expect(tokenIn(product, "surface-card")).toBe(tokenIn(product, "surface-page"));
    expect(tokenIn(product, "surface-sunken")).toBe("#efe9dc");
    expect(tokenIn(product, "border-light")).toBe("#d4cab6");
    expect(product).toContain("--border-frame: var(--charcoal-800)");
  });

  test("there is no white surface and no shadow in the layer", () => {
    const rules = product.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/#fff(fff)?\b/i);
    expect(rules).not.toContain("shadow");
  });

  test("defines the card and control radii as Tailwind theme tokens", () => {
    expect(theme).toContain("--radius-card: 16px");
    expect(theme).toContain("--radius-control: 6px");
    // The old radii other components rely on are untouched.
    expect(theme).toContain("--radius-md: 6px");
    expect(theme).toContain("--radius-sm: 4px");
  });

  test("leaves the dark theme alone, except the frame, which a dark region must not draw in ink", () => {
    expect(product).toContain(':root:not([data-atr-theme="dark"])');
    const dark = product.match(/^\[data-atr-theme="dark"\]\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(dark.match(/--[\w-]+(?=:)/g)).toEqual(["--border-frame"]);
  });

  test("every status pair is at least 4.5:1", () => {
    for (const status of ["positive", "warning", "danger", "info", "neutral"]) {
      const ratio = contrast(
        tokenIn(brand, `status-${status}-fg`),
        tokenIn(brand, `status-${status}-bg`),
      );
      expect([status, ratio >= 4.5]).toEqual([status, true]);
    }
  });

  test("muted text clears 4.5:1 on the page and on a card", () => {
    const muted = tokenIn(brand, "charcoal-500");
    for (const surface of ["surface-page", "surface-card", "surface-sunken"]) {
      expect([surface, contrast(muted, tokenIn(product, surface)) >= 4.5]).toEqual([surface, true]);
    }
  });
});
