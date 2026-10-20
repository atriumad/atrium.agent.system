import { expect, test } from "bun:test";
import { proxyWarning } from "../lib/startup-warning";

const SECRET = "s".repeat(32);

test("no warning outside production", () => {
  expect(proxyWarning({ NODE_ENV: "development" })).toBeNull();
  expect(proxyWarning({})).toBeNull();
});

test("production with hops and a 32-character secret is quiet", () => {
  expect(
    proxyWarning({ NODE_ENV: "production", QR_CARD_PROXY_HOPS: "1", LOYALTY_PROXY_SECRET: SECRET }),
  ).toBeNull();
});

test("unset or zero hops warns", () => {
  expect(proxyWarning({ NODE_ENV: "production", LOYALTY_PROXY_SECRET: SECRET })).toContain(
    "missing=QR_CARD_PROXY_HOPS",
  );
  expect(
    proxyWarning({ NODE_ENV: "production", QR_CARD_PROXY_HOPS: "0", LOYALTY_PROXY_SECRET: SECRET }),
  ).toContain("shared_rate_limit_bucket");
});

test("a missing or short secret warns, and the secret never appears", () => {
  const short = "short-secret-value";
  const w = proxyWarning({
    NODE_ENV: "production",
    QR_CARD_PROXY_HOPS: "1",
    LOYALTY_PROXY_SECRET: short,
  });
  expect(w).toContain("missing=LOYALTY_PROXY_SECRET");
  expect(w).not.toContain(short);
  expect(w).not.toContain("\n");
  expect(proxyWarning({ NODE_ENV: "production", QR_CARD_PROXY_HOPS: "2" })).toContain(
    "LOYALTY_PROXY_SECRET",
  );
});

test("both missing names both", () => {
  expect(proxyWarning({ NODE_ENV: "production" })).toContain(
    "missing=QR_CARD_PROXY_HOPS,LOYALTY_PROXY_SECRET",
  );
});
