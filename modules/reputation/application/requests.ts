import {
  type Channel,
  contactFor,
  listLocations,
  sendToGuest,
  signUnsubscribeToken,
  type Tx,
} from "@atrium/core";
import { renderReviewRequest } from "@atrium/email";
import { and, asc, eq, lte } from "drizzle-orm";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
} from "../domain/invitations";
import { isStaleVisit, nextSendTime } from "../domain/timing";
import { reviewRequests, surveyInvitations } from "../infra/schema";
import { getLocationSettings } from "./settings";
import { clock, envelope, type ReputationDeps } from "./shared";

export type ScheduleOutcome =
  | { status: "scheduled"; sendAt: Date }
  | { status: "duplicate" }
  | {
      status: "skipped";
      reason: "stale_visit" | "no_review_url" | "unknown_location" | "location_inactive";
    };

async function locationOf(tx: Tx, clientId: string, locationId: string) {
  return (await listLocations(tx, clientId)).find((l) => l.id === locationId) ?? null;
}

/**
 * Ask's first step: a visit was identified, so schedule the request for the happy moment. One
 * request per guest, place and day; a re-delivered event changes nothing. A visit that is already
 * stale, or a location with no review link to point at, is recorded as skipped.
 */
export async function scheduleReviewRequest(
  tx: Tx,
  input: { clientId: string; locationId: string; guestId: string; visitDate: string },
  deps: ReputationDeps = {},
): Promise<ScheduleOutcome> {
  const now = clock(deps);
  const location = await locationOf(tx, input.clientId, input.locationId);
  const skip = async (
    reason: "stale_visit" | "no_review_url" | "unknown_location" | "location_inactive",
  ) => {
    if (location) {
      await tx
        .insert(reviewRequests)
        .values({ ...input, status: "skipped", skippedReason: reason, sendAt: now })
        .onConflictDoNothing();
    }
    return { status: "skipped", reason } as const;
  };

  if (!location) return skip("unknown_location");
  if (location.status !== "active") return skip("location_inactive");
  if (isStaleVisit(input.visitDate, now, location.timeZone)) return skip("stale_visit");
  const settings = await getLocationSettings(tx, input.locationId);
  if (!settings.reviewUrl) return skip("no_review_url");

  const sendAt = nextSendTime(now, settings.requestDelayMinutes, location.timeZone);
  const created = await tx
    .insert(reviewRequests)
    .values({ ...input, status: "scheduled", sendAt })
    .onConflictDoNothing()
    .returning({ id: reviewRequests.id });
  return created.length === 0 ? { status: "duplicate" } : { status: "scheduled", sendAt };
}

/** Requests whose time has come, oldest first. Read under agency scope by the worker. */
export function listDueReviewRequests(tx: Tx, now: Date, limit = 100) {
  return tx
    .select({
      id: reviewRequests.id,
      clientId: reviewRequests.clientId,
      locationId: reviewRequests.locationId,
    })
    .from(reviewRequests)
    .where(and(eq(reviewRequests.status, "scheduled"), lte(reviewRequests.sendAt, now)))
    .orderBy(asc(reviewRequests.sendAt))
    .limit(Math.min(limit, 500));
}

export type SendOutcome =
  | { outcome: "sent"; channel: Channel; notificationId: string; invitationId: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "already_handled" };

/** Email only. A review request is a solicitation, so it needs marketing consent (pending legal review). */
async function chooseChannel(
  tx: Tx,
  guestId: string,
): Promise<{ channel: Channel } | { reason: string }> {
  const decision = await contactFor(tx, guestId, "email", "marketing");
  return decision.allowed ? { channel: "email" } : { reason: decision.reason };
}

/**
 * Sends one scheduled request: picks a channel the guest agreed to, issues a single-use survey
 * link, sends it through the notification door, and records what happened. The link points to the
 * survey; the survey's final screen carries the Google button for everyone (ADR 0018).
 */
export async function sendReviewRequest(
  tx: Tx,
  requestId: string,
  context: { publicBaseUrl: string; unsubscribeSecret?: string },
  deps: ReputationDeps = {},
): Promise<SendOutcome> {
  const now = clock(deps);
  const [request] = await tx
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.id, requestId))
    .for("update");
  if (!request || request.status !== "scheduled") return { outcome: "already_handled" };

  const skip = async (reason: string): Promise<SendOutcome> => {
    await tx
      .update(reviewRequests)
      .set({ status: "skipped", skippedReason: reason })
      .where(eq(reviewRequests.id, requestId));
    return { outcome: "skipped", reason };
  };

  const settings = await getLocationSettings(tx, request.locationId);
  if (!settings.reviewUrl) return skip("no_review_url");
  const location = (await listLocations(tx, request.clientId)).find(
    (l) => l.id === request.locationId,
  );
  if (!location) return skip("unknown_location");
  if (location.status !== "active") return skip("location_inactive");

  const choice = await chooseChannel(tx, request.guestId);
  if ("reason" in choice) return skip(choice.reason);

  const token = generateInvitationToken();
  const [invitation] = await tx
    .insert(surveyInvitations)
    .values({
      clientId: request.clientId,
      locationId: request.locationId,
      guestId: request.guestId,
      tokenHash: hashInvitationToken(token),
      channel: choice.channel,
      expiresAt: invitationExpiry(now),
    })
    .returning({ id: surveyInvitations.id });
  if (!invitation) throw new Error("invitation was not created");

  const base = context.publicBaseUrl.replace(/\/$/, "");
  const link = `${base}/s/${token}`;
  const unsub = context.unsubscribeSecret
    ? signUnsubscribeToken(context.unsubscribeSecret, request.clientId, request.guestId)
    : null;
  const { html, text } = await renderReviewRequest({
    placeName: location.name,
    link,
    unsubscribeUrl: unsub ? `${base}/u/${unsub}` : null,
  });
  const sent = await sendToGuest(
    tx,
    {
      clientId: request.clientId,
      guestId: request.guestId,
      channel: choice.channel,
      purpose: "marketing",
      kind: "reputation.review_request",
      subject: `How was your visit to ${location.name}?`,
      body: text,
      html,
      idempotencyKey: `review-request-${request.id}`,
      ...(unsub
        ? {
            headers: {
              "List-Unsubscribe": `<${base}/unsubscribe-api/${unsub}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    },
    deps.transport,
  );
  if (!sent.sent) return skip(sent.reason);

  await tx
    .update(reviewRequests)
    .set({ status: "sent", sentAt: now, invitationId: invitation.id })
    .where(eq(reviewRequests.id, requestId));
  await deps.publish?.(
    {
      ...envelope(request.clientId, request.locationId, now),
      type: "survey.sent",
      version: 1,
      data: { invitationId: invitation.id, channel: choice.channel },
    },
    tx,
  );
  return {
    outcome: "sent",
    channel: choice.channel,
    notificationId: sent.notificationId,
    invitationId: invitation.id,
  };
}

export function listReviewRequests(tx: Tx, clientId: string, limit = 50) {
  return tx
    .select()
    .from(reviewRequests)
    .where(eq(reviewRequests.clientId, clientId))
    .orderBy(asc(reviewRequests.sendAt))
    .limit(Math.min(limit, 200));
}

/**
 * Drops a scheduled request without sending it. Used when the agent that would send it is off,
 * so switching Ask back on later does not release a backlog of stale requests at once.
 */
export async function skipReviewRequest(
  tx: Tx,
  requestId: string,
  reason: string,
): Promise<boolean> {
  const skipped = await tx
    .update(reviewRequests)
    .set({ status: "skipped", skippedReason: reason })
    .where(and(eq(reviewRequests.id, requestId), eq(reviewRequests.status, "scheduled")))
    .returning({ id: reviewRequests.id });
  return skipped.length > 0;
}
