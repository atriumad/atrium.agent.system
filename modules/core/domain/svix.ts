// modules/core/domain/svix.ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a webhook signed the Svix way, which is how Resend signs its events: HMAC-SHA256 over
 * `id.timestamp.body` with the secret's bytes, base64, in a header of space-separated `v1,<sig>`
 * entries. Constant-time compare; a timestamp outside the tolerance, in either direction, fails.
 */
export function verifySvixSignature(input: {
  secret: string;
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
  now: Date;
  toleranceSeconds?: number;
}): boolean {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds)) return false;
  if (Math.abs(input.now.getTime() / 1000 - seconds) > (input.toleranceSeconds ?? 300))
    return false;
  const key = Buffer.from(
    input.secret.startsWith("whsec_") ? input.secret.slice(6) : input.secret,
    "base64",
  );
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.body}`).digest();
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}
