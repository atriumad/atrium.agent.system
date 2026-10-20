/**
 * Contact identifiers and consent rules. Pure: no database, no framework.
 * Docs: modules / Core (Guests, Consents) and architecture / Security (Personal data).
 */
export const CHANNELS = ["email"] as const;
export type Channel = (typeof CHANNELS)[number];

export const PURPOSES = ["transactional", "marketing"] as const;
export type Purpose = (typeof PURPOSES)[number];

/** Where a consent decision came from. Opt-in sources are recorded per contact. */
export const CONSENT_SOURCES = [
  "pos",
  "wifi_portal",
  "qr",
  "checkout",
  "survey",
  "manual",
  "import",
  "email_unsubscribe",
  "email_bounce",
  "email_complaint",
  "loyalty_card",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const IDENTIFIER_KINDS = ["email", "phone"] as const;
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];

/** The identifier an address channel is delivered to. */
export const CHANNEL_IDENTIFIER: Record<Channel, IdentifierKind> = {
  email: "email",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return value.length <= 254 && EMAIL.test(value) ? value : null;
}

/**
 * E.164. Ten digits, or eleven starting with 1, are US numbers (the pilot market).
 * Anything else must arrive with a leading + and 8 to 15 digits.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : null;
  }
  if (digits.length === 10 && digits[0] !== "0" && digits[0] !== "1") return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && digits[1] !== "0" && digits[1] !== "1") {
    return `+${digits}`;
  }
  return null;
}

export type ConsentRecord = {
  channel: Channel;
  purpose: Purpose;
  granted: boolean;
};

/** The log is append-only: the latest record for a channel and purpose is the current decision. */
export type ConsentState = "granted" | "opted_out" | "none";

export function currentConsent(
  log: readonly ConsentRecord[],
  channel: Channel,
  purpose: Purpose,
): ConsentState {
  let state: ConsentState = "none";
  for (const record of log) {
    if (record.channel === channel && record.purpose === purpose) {
      state = record.granted ? "granted" : "opted_out";
    }
  }
  return state;
}

export type ContactDenial = "unknown_guest" | "erased" | "no_consent" | "opted_out" | "no_contact";

export type ContactDecision =
  | { allowed: true; address: string }
  | { allowed: false; reason: ContactDenial };

/**
 * No consent, no message. The decision needs the guest to exist and not be erased, a recorded
 * grant for exactly this channel and purpose, and an address for the channel.
 */
export function decideContact(input: {
  guestExists: boolean;
  erased: boolean;
  consent: ConsentState;
  address: string | null;
}): ContactDecision {
  if (!input.guestExists) return { allowed: false, reason: "unknown_guest" };
  if (input.erased) return { allowed: false, reason: "erased" };
  if (input.consent === "opted_out") return { allowed: false, reason: "opted_out" };
  if (input.consent === "none") return { allowed: false, reason: "no_consent" };
  if (!input.address) return { allowed: false, reason: "no_contact" };
  return { allowed: true, address: input.address };
}
