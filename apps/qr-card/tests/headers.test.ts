import { expect, test } from "bun:test";
import config from "../next.config";

test("every path gets no-referrer, noindex, nosniff, no framing and no camera", async () => {
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/:path*")!;
  const get = (k: string) => all.headers.find((h) => h.key === k)?.value;
  expect(get("Referrer-Policy")).toBe("no-referrer");
  expect(get("X-Robots-Tag")).toBe("noindex, nofollow");
  expect(get("X-Content-Type-Options")).toBe("nosniff");
  expect(get("X-Frame-Options")).toBe("DENY");
  expect(get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  expect(get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
});

test("there are no rewrites: the API is reached only through the route handler", async () => {
  expect(config.rewrites).toBeUndefined();
});
