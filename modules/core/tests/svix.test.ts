// modules/core/tests/svix.test.ts
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifySvixSignature } from "../domain/svix";

const secretBytes = Buffer.from("a-test-secret-with-some-length");
const SECRET = `whsec_${secretBytes.toString("base64")}`;
const NOW = new Date("2026-10-15T12:00:00Z");
const ts = String(Math.floor(NOW.getTime() / 1000));
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "m1" } });
const sig = (id: string, t: string, b: string) =>
  `v1,${createHmac("sha256", secretBytes).update(`${id}.${t}.${b}`).digest("base64")}`;
const base = {
  secret: SECRET,
  id: "msg_1",
  timestamp: ts,
  signature: sig("msg_1", ts, body),
  body,
  now: NOW,
};

describe("Svix signature", () => {
  test("a valid signature passes, and so does one among several", () => {
    expect(verifySvixSignature(base)).toBe(true);
    expect(verifySvixSignature({ ...base, signature: `v1,AAAA ${base.signature}` })).toBe(true);
  });
  test("a wrong secret, a tampered body, a different id and a bad version fail", () => {
    expect(
      verifySvixSignature({ ...base, secret: `whsec_${Buffer.from("other").toString("base64")}` }),
    ).toBe(false);
    expect(verifySvixSignature({ ...base, body: `${body} ` })).toBe(false);
    expect(verifySvixSignature({ ...base, id: "msg_2" })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: base.signature.replace("v1,", "v2,") })).toBe(
      false,
    );
  });
  test("missing headers, a garbage timestamp and a stale or future timestamp fail", () => {
    expect(verifySvixSignature({ ...base, id: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, timestamp: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, timestamp: "abc" })).toBe(false);
    const old = String(Math.floor(NOW.getTime() / 1000) - 10 * 60);
    expect(
      verifySvixSignature({ ...base, timestamp: old, signature: sig("msg_1", old, body) }),
    ).toBe(false);
    const future = String(Math.floor(NOW.getTime() / 1000) + 10 * 60);
    expect(
      verifySvixSignature({ ...base, timestamp: future, signature: sig("msg_1", future, body) }),
    ).toBe(false);
  });
});
