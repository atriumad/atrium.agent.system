import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Survey links. Two kinds:
 *  - an invitation: a random single-use token, stored as a hash, valid for 7 days;
 *  - a QR: a long-lived multi-use token signed with a secret, with no database row, revocable
 *    by bumping the location's QR version.
 */
export const INVITATION_DAYS = 7;
const PREFIX = "svy_";

export function generateInvitationToken(): string {
  return `${PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeInvitationToken(value: string): boolean {
  return value.startsWith(PREFIX) && value.length > PREFIX.length && value.length <= 100;
}

export function invitationExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
}

export type InvitationState = "valid" | "expired" | "used";

export function invitationState(
  invitation: { expiresAt: Date; usedAt: Date | null },
  now: Date,
): InvitationState {
  if (invitation.usedAt) return "used";
  return now.getTime() >= invitation.expiresAt.getTime() ? "expired" : "valid";
}

const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

/** `qr1.<locationId>.<version>.<signature>` */
export function signQrToken(secret: string, locationId: string, version: number): string {
  const payload = `qr1.${locationId}.${version}`;
  return `${payload}.${sign(secret, payload)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The location and version a QR token names, or null if it is malformed or not ours. */
export function verifyQrToken(
  secret: string,
  token: string,
): { locationId: string; version: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "qr1") return null;
  const [, locationId, versionText, signature] = parts as [string, string, string, string];
  if (!UUID.test(locationId) || !/^[1-9]\d{0,5}$/.test(versionText)) return null;
  const expected = Buffer.from(sign(secret, `qr1.${locationId}.${versionText}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { locationId, version: Number(versionText) };
}

/** A salted hash of the device cookie, for the per-device limit. The cookie itself is not stored. */
export function hashDevice(secret: string, deviceId: string): string {
  return createHmac("sha256", secret).update(`device:${deviceId}`).digest("hex");
}

/** One anonymous submission per device per location in this window. */
export const DEVICE_WINDOW_HOURS = 12;
