import {
  type Channel,
  type ContactDecision,
  contactFor,
  listLocations,
  sendToGuest,
  smsAllowed,
  type Tx,
} from "@atrium/core";
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

/** Email first; SMS only when the client's registration allows it and the guest agreed to SMS. */
async function chooseChannel(
  tx: Tx,
  clientId: string,
  guestId: string,
): Promise<{ channel: Channel } | { reason: string }> {
  let firstDenial: ContactDecision | null = null;
  for (const channel of ["email", "sms"] as const) {
    if (channel === "sms" && !(await smsAllowed(tx, clientId))) continue;
    // A review request is a solicitation, so it needs marketing consent (pending legal review).
    const decision = await contactFor(tx, guestId, channel, "marketing");
    if (decision.allowed) return { channel };
    firstDenial ??= decision;
  }
  return { reason: firstDenial && !firstDenial.allowed ? firstDenial.reason : "no_consent" };
}

/**
 * Sends one scheduled request: picks a channel the guest agreed to, issues a single-use survey
 * link, sends it through the notification door, and records what happened. The link points to the
 * survey; the survey's final screen carries the Google button for everyone (ADR 0018).
 */
export async function sendReviewRequest(
  tx: Tx,
  requestId: string,
  context: { publicBaseUrl: string },
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

  const choice = await chooseChannel(tx, request.clientId, request.guestId);
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

  const link = `${context.publicBaseUrl.replace(/\/$/, "")}/s/${token}`;
  const body =
    choice.channel === "sms"
      ? `Thanks for visiting ${location.name}! How was it? ${link} Reply STOP to opt out.`
      : `Thanks for visiting ${location.name}.\n\nHow was your visit? It takes under a minute:\n${link}\n\nThe link works once and expires in 7 days.`;
  const sent = await sendToGuest(
    tx,
    {
      clientId: request.clientId,
      guestId: request.guestId,
      channel: choice.channel,
      purpose: "marketing",
      kind: "reputation.review_request",
      subject: `How was your visit to ${location.name}?`,
      body,
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
