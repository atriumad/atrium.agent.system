import { describe, expect, test } from "bun:test";
import { devTransport } from "../domain/notifications";
import { transportFromEnv } from "../infra/transport";

describe("transportFromEnv", () => {
  test("Resend when the key and the sender are set", () => {
    expect(transportFromEnv({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.test" }).name).toBe("resend");
  });
  test("the development transport in development and test with no key", () => {
    expect(transportFromEnv({ NODE_ENV: "development" })).toBe(devTransport);
    expect(transportFromEnv({ NODE_ENV: "test" })).toBe(devTransport);
  });
  test("outside development, with NODE_ENV unset counting as production, a missing key or sender refuses to start", () => {
    expect(() => transportFromEnv({})).toThrow();
    expect(() => transportFromEnv({ NODE_ENV: "production" })).toThrow();
    expect(() => transportFromEnv({ NODE_ENV: "production", RESEND_API_KEY: "k" })).toThrow();
  });
  test("a key without a sender, or a sender without a key, is a mistake even in development", () => {
    expect(() => transportFromEnv({ NODE_ENV: "development", RESEND_API_KEY: "k" })).toThrow();
    expect(() => transportFromEnv({ NODE_ENV: "development", EMAIL_FROM: "a@b.test" })).toThrow();
  });
});
