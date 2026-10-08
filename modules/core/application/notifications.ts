import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ContactDenial } from "../domain/contact";
import {
  devTransport,
  type GuestSendInput,
  isValidNotificationKind,
  type MessageDraft,
  maskAddress,
  type NotificationTransport,
} from "../domain/notifications";
import { users } from "../infra/auth-schema";
import type { Tx } from "../infra/db";
import { notifications } from "../infra/schema";
import { contactFor } from "./guests";

export type SendResult =
  | { sent: true; notificationId: string; to: string }
  | { sent: false; reason: ContactDenial };

/**
 * The one door to a guest. Consent is checked here for the channel and purpose, the real address
 * is read from Core and handed to the transport, and the outbox keeps only a masked copy.
 * Returns why nothing was sent instead of throwing: a missing consent is an answer, not an error.
 */
export async function sendToGuest(
  tx: Tx,
  input: GuestSendInput,
  transport: NotificationTransport = devTransport,
): Promise<SendResult> {
  if (!isValidNotificationKind(input.kind))
    throw new Error(`invalid notification kind: ${input.kind}`);
  const contact = await contactFor(tx, input.guestId, input.channel, input.purpose);
  if (!contact.allowed) return { sent: false, reason: contact.reason };

  const status = await transport.deliver({
    channel: input.channel,
    to: contact.address,
    subject: input.subject ?? null,
    body: input.body,
  });
  const [row] = await tx
    .insert(notifications)
    .values({
      clientId: input.clientId,
      kind: input.kind,
      channel: input.channel,
      purpose: input.purpose,
      recipientType: "guest",
      recipientId: input.guestId,
      toMasked: maskAddress(contact.address),
      subject: input.subject ?? null,
      body: input.body,
      transport: transport.name,
      status,
    })
    .returning({ id: notifications.id });
  if (!row) throw new Error("notification was not recorded");
  return { sent: true, notificationId: row.id, to: maskAddress(contact.address) };
}

/**
 * Tells a person on the team (an owner, an account manager). Internal and transactional, so it
 * needs no guest consent. Email only.
 */
export async function sendToUser(
  tx: Tx,
  input: MessageDraft & { clientId: string; userId: string },
  transport: NotificationTransport = devTransport,
): Promise<SendResult> {
  if (!isValidNotificationKind(input.kind))
    throw new Error(`invalid notification kind: ${input.kind}`);
  const [user] = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!user) return { sent: false, reason: "unknown_guest" };

  const status = await transport.deliver({
    channel: "email",
    to: user.email,
    subject: input.subject ?? null,
    body: input.body,
  });
  const [row] = await tx
    .insert(notifications)
    .values({
      clientId: input.clientId,
      kind: input.kind,
      channel: "email",
      purpose: "transactional",
      recipientType: "user",
      recipientId: input.userId,
      toMasked: maskAddress(user.email),
      subject: input.subject ?? null,
      body: input.body,
      transport: transport.name,
      status,
    })
    .returning({ id: notifications.id });
  if (!row) throw new Error("notification was not recorded");
  return { sent: true, notificationId: row.id, to: maskAddress(user.email) };
}

/** Newest first. Every query names the client; RLS is the second defense. */
export function listNotifications(tx: Tx, clientId: string, limit = 50) {
  return tx
    .select()
    .from(notifications)
    .where(eq(notifications.clientId, clientId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(limit, 200));
}

export type UserNotification = {
  id: string;
  kind: string;
  subject: string | null;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

/** What was sent to this person, newest first, and how many they have not read. */
export async function listUserNotifications(
  tx: Tx,
  userId: string,
  limit = 30,
): Promise<{ notifications: UserNotification[]; unread: number }> {
  const mine = and(eq(notifications.recipientType, "user"), eq(notifications.recipientId, userId));
  const rows = await tx
    .select({
      id: notifications.id,
      kind: notifications.kind,
      subject: notifications.subject,
      body: notifications.body,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(mine)
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(limit, 100));
  const unread = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(mine, isNull(notifications.readAt)));
  return { notifications: rows, unread: unread.length };
}

/** Marks some (or all) of this person's notifications as read. Anyone else's are left alone. */
export async function markUserNotificationsRead(
  tx: Tx,
  userId: string,
  which: { ids: string[] } | { all: true },
  now: Date = new Date(),
): Promise<void> {
  const mine = and(
    eq(notifications.recipientType, "user"),
    eq(notifications.recipientId, userId),
    isNull(notifications.readAt),
  );
  await tx
    .update(notifications)
    .set({ readAt: now })
    .where("ids" in which ? and(mine, inArray(notifications.id, which.ids)) : mine);
}
