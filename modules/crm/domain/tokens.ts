import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Loyalty tokens.
 *  - a card token: 16 random bytes in base64url, shown to the customer's device only; the
 *    database stores its hash;
 *  - a short code: 8 characters a person can read out, without look-alike characters;
 *  - a join token: a signed, long-lived token in the program's QR (`jq1.` prefix, its own
 *    secret), so a survey QR (`qr1.`) can never verify as a join token.
 */
export function generateCardToken(): string {
  return randomBytes(16).toString("base64url");
}

export function hashCardToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeCardToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(value);
}

/** No 0, O, 1, I or L. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

/** `random` returns a number in [0, 1); the default is cryptographically secure. */
export function generateShortCode(random?: () => number): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const index = random ? Math.floor(random() * ALPHABET.length) : randomInt(ALPHABET.length);
    code += ALPHABET[index];
  }
  return code;
}

export function formatShortCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeShortCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[-\s]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) if (!ALPHABET.includes(char)) return null;
  return code;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

/** `jq1.<programId>.<version>.<signature>` */
export function signJoinToken(secret: string, programId: string, version: number): string {
  if (!UUID.test(programId)) throw new Error("signJoinToken: programId is not a uuid");
  if (!Number.isInteger(version) || version < 1 || version > 999_999) {
    throw new Error("signJoinToken: version must be an integer from 1 to 999999");
  }
  const payload = `jq1.${programId}.${version}`;
  return `${payload}.${sign(secret, payload)}`;
}

/** The program and version a join token names, or null if it is malformed or not ours. */
export function verifyJoinToken(
  secret: string,
  token: string,
): { programId: string; version: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "jq1") return null;
  const [, programId, versionText, signature] = parts as [string, string, string, string];
  if (!UUID.test(programId) || !/^[1-9]\d{0,5}$/.test(versionText)) return null;
  const expected = Buffer.from(sign(secret, `jq1.${programId}.${versionText}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { programId: programId.toLowerCase(), version: Number(versionText) };
}
