import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The link in an email's footer. `un1.<clientId>.<guestId>.<signature>`, signed with a secret and
 * stored nowhere. It never expires: an unsubscribe link must keep working, and rotating the
 * secret revokes every link.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export function signUnsubscribeToken(secret: string, clientId: string, guestId: string): string {
  const payload = `un1.${clientId}.${guestId}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { clientId: string; guestId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "un1") return null;
  const [, clientId, guestId, signature] = parts as [string, string, string, string];
  if (!UUID.test(clientId) || !UUID.test(guestId)) return null;
  const expected = Buffer.from(sign(secret, `un1.${clientId}.${guestId}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { clientId, guestId };
}
