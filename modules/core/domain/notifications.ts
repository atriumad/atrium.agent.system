import type { Channel, Purpose } from "./contact";

/** What a transport delivers. The address is real; it never reaches the outbox table. */
export type OutgoingMessage = {
  channel: Channel;
  to: string;
  subject: string | null;
  body: string;
};

export type DeliveryStatus = "recorded" | "sent" | "failed";

/** A way to deliver messages. The development transport records and sends nothing. */
export type NotificationTransport = {
  name: string;
  deliver(message: OutgoingMessage): Promise<DeliveryStatus>;
};

export const devTransport: NotificationTransport = {
  name: "dev",
  deliver: async () => "recorded",
};

/** `ana.lopez@mail.com` becomes `a***@mail.com`; `+17135550142` becomes `+1******0142`. */
export function maskAddress(address: string): string {
  const at = address.indexOf("@");
  if (at > 0) return `${address[0]}***${address.slice(at)}`;
  const digits = address.replace(/[^\d+]/g, "");
  if (digits.length <= 6) return "***";
  return `${digits.slice(0, 2)}${"*".repeat(digits.length - 6)}${digits.slice(-4)}`;
}

export const NOTIFICATION_KIND = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isValidNotificationKind(value: string): boolean {
  return NOTIFICATION_KIND.test(value);
}

export type MessageDraft = {
  /** `module.thing`: `reputation.review_request`. */
  kind: string;
  subject?: string;
  body: string;
};

export type GuestSendInput = MessageDraft & {
  clientId: string;
  guestId: string;
  channel: Channel;
  purpose: Purpose;
};
