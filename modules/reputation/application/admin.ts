import type { HelpAttachment } from "@atrium/contracts";
import {
  type Actor,
  can,
  describeLocations,
  type LocationStatus,
  listLocationLabels,
  locationVisible,
  type Scope,
  type Tx,
  writeAudit,
} from "@atrium/core";
import { and, desc, eq, sql } from "drizzle-orm";
import { awaitingSide, type HelpSide, preview, type RequestStatus } from "../domain/help";
import { generateInvitationToken, hashInvitationToken, signQrToken } from "../domain/invitations";
import {
  locationSettings,
  recoveryCases,
  surveyInvitations,
  surveyRequestMessages,
  surveyRequests,
  surveyResponses,
} from "../infra/schema";
import { attachmentValue, checkAttachment, notifyOthers } from "./help-shared";
import { clock, type ReputationDeps } from "./shared";

export class SurveyForbiddenError extends Error {}
export class SurveyNotFoundError extends Error {}
export class SurveyStateError extends Error {}

export const actorOf = (scope: Scope): Actor => ({ type: "user", id: scope.userId });

type SurveyAction = "read" | "forms" | "operate" | "manage" | "request";

export function assertCan(scope: Scope, action: SurveyAction) {
  if (!can(scope.role, "survey", action)) {
    throw new SurveyForbiddenError(`role ${scope.role} cannot ${action} surveys`);
  }
}

export type SurveyResponseRow = {
  id: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  rating: number;
  bestPart: string | null;
  improve: string | null;
  comment: string | null;
  wantsContact: boolean;
  severity: string | null;
  source: "invitation" | "qr";
  reviewClicked: boolean;
  caseId: string | null;
  createdAt: Date;
};

/** What guests answered, newest first. For the people who run the account; RLS picks the clients. */
export async function listSurveyResponses(
  tx: Tx,
  scope: Scope,
  filter: { locationId?: string; maxRating?: number } = {},
): Promise<SurveyResponseRow[]> {
  assertCan(scope, "read");
  const rows = await tx
    .select({ r: surveyResponses, caseId: recoveryCases.id })
    .from(surveyResponses)
    .leftJoin(recoveryCases, eq(recoveryCases.responseId, surveyResponses.id))
    .where(
      and(
        filter.locationId ? eq(surveyResponses.locationId, filter.locationId) : undefined,
        filter.maxRating ? sql`${surveyResponses.rating} <= ${filter.maxRating}` : undefined,
      ),
    )
    .orderBy(desc(surveyResponses.createdAt))
    .limit(200);
  // RLS already narrows a location manager; this keeps the rule true if a policy ever slips.
  const visible = rows.filter(({ r }) => locationVisible(scope, r.locationId));
  const labels = await describeLocations(
    tx,
    visible.map(({ r }) => r.locationId),
  );
  return visible.map(({ r, caseId }) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: labels.get(r.locationId)?.clientName ?? "",
    locationId: r.locationId,
    locationName: labels.get(r.locationId)?.locationName ?? "",
    rating: r.rating,
    bestPart: r.bestPart,
    improve: r.improve,
    comment: r.comment,
    wantsContact: r.wantsContact,
    severity: r.severity,
    source: r.invitationId ? "invitation" : "qr",
    reviewClicked: r.reviewClickedAt !== null,
    caseId,
    createdAt: r.createdAt,
  }));
}

export type SurveyForm = {
  locationId: string;
  locationName: string;
  clientId: string;
  clientName: string;
  reviewUrl: string | null;
  requestDelayMinutes: number;
  qrVersion: number;
  /** The printable link. Signed, no row behind it; rotating the QR invalidates it. */
  qrPath: string | null;
  /** Only an active location collects answers; the others show no QR. */
  status: LocationStatus;
};

/** The survey setup of every location the scope can manage: link, QR and timing. */
export async function listSurveyForms(
  tx: Tx,
  scope: Scope,
  qrSecret: string | undefined,
): Promise<SurveyForm[]> {
  assertCan(scope, "forms");
  const labels = await listLocationLabels(tx);
  const settings = await tx.select().from(locationSettings);
  const byLocation = new Map(settings.map((s) => [s.locationId, s]));
  return labels.map((l) => {
    const s = byLocation.get(l.id);
    const qrVersion = s?.qrVersion ?? 1;
    return {
      locationId: l.id,
      locationName: l.locationName,
      clientId: l.clientId,
      clientName: l.clientName,
      reviewUrl: s?.reviewUrl ?? null,
      requestDelayMinutes: s?.requestDelayMinutes ?? 120,
      qrVersion,
      qrPath:
        qrSecret && l.status === "active" ? `/q/${signQrToken(qrSecret, l.id, qrVersion)}` : null,
      status: l.status,
    };
  });
}

/**
 * A single-use link for one guest, made by hand: to send from a phone, paste in a message or
 * print. It lives as long as an invitation does and works once.
 */
export async function createManualInvitation(
  tx: Tx,
  scope: Scope,
  locationId: string,
  deps: ReputationDeps = {},
): Promise<{ token: string; expiresAt: Date }> {
  assertCan(scope, "operate");
  const label = (await describeLocations(tx, [locationId])).get(locationId);
  if (!label) throw new SurveyNotFoundError("location not found");
  if (label.status !== "active") throw new SurveyStateError("the location is not active");
  const now = clock(deps);
  const token = generateInvitationToken();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await tx.insert(surveyInvitations).values({
    clientId: label.clientId,
    locationId,
    guestId: null,
    tokenHash: hashInvitationToken(token),
    channel: "manual",
    expiresAt,
  });
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: label.clientId,
    locationId,
    action: "reputation.create_survey_link",
    decision: "executed",
  });
  return { token, expiresAt };
}

export type SurveyRequestRow = {
  id: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  requestedByName: string;
  note: string | null;
  status: RequestStatus;
  createdAt: Date;
  handledAt: Date | null;
  response: string | null;
  lastMessageAt: Date | null;
  lastAuthorSide: HelpSide | null;
  lastPreview: string | null;
  awaiting: HelpSide | null;
};

export function toRequestRow(
  r: typeof surveyRequests.$inferSelect,
  labels: Map<string, { clientName: string; locationName: string }>,
): SurveyRequestRow {
  const lastAuthorSide = (r.lastAuthorSide as HelpSide | null) ?? null;
  const status = r.status as RequestStatus;
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: labels.get(r.locationId)?.clientName ?? "",
    locationId: r.locationId,
    locationName: labels.get(r.locationId)?.locationName ?? "",
    requestedByName: r.requestedByName,
    note: r.note,
    status,
    createdAt: r.createdAt,
    handledAt: r.handledAt,
    response: r.response,
    lastMessageAt: r.lastMessageAt,
    lastAuthorSide,
    lastPreview: r.lastPreview,
    awaiting: awaitingSide(status, lastAuthorSide),
  };
}

export async function listSurveyRequests(tx: Tx, scope: Scope): Promise<SurveyRequestRow[]> {
  // Requests span every location of a client and their policy is client-wide, so a location
  // manager (read only) stays out: `forms` and `request` are the roles that see the whole client.
  if (!can(scope.role, "survey", "forms") && !can(scope.role, "survey", "request")) {
    throw new SurveyForbiddenError(`role ${scope.role} cannot see survey requests`);
  }
  const rows = await tx
    .select()
    .from(surveyRequests)
    .orderBy(sql`coalesce(${surveyRequests.lastMessageAt}, ${surveyRequests.createdAt}) desc`)
    .limit(200);
  const labels = await describeLocations(
    tx,
    rows.map((r) => r.locationId),
  );
  return rows.map((r) => toRequestRow(r, labels));
}

/** A client opens a help conversation: its first message is the note, optionally with an attachment. */
export async function createSurveyRequest(
  tx: Tx,
  scope: Scope,
  userName: string,
  input: { locationId: string; note: string; attachment?: HelpAttachment | null },
  deps: ReputationDeps = {},
) {
  assertCan(scope, "request");
  const note = input.note.trim();
  if (!note) throw new Error("the request needs a message");
  const label = (await describeLocations(tx, [input.locationId])).get(input.locationId);
  if (!label) throw new SurveyNotFoundError("location not found");
  const now = clock(deps);
  const [row] = await tx
    .insert(surveyRequests)
    .values({
      clientId: label.clientId,
      locationId: input.locationId,
      requestedBy: scope.userId,
      requestedByName: userName,
      note,
      createdAt: now,
      lastMessageAt: now,
      lastAuthorSide: "client",
      lastPreview: preview(note),
    })
    .returning({ id: surveyRequests.id });
  if (!row) throw new Error("request was not stored");
  const request = { id: row.id, clientId: label.clientId, locationId: input.locationId };
  const attachment = await checkAttachment(tx, scope, request.clientId, input.attachment ?? null);
  await tx.insert(surveyRequestMessages).values({
    requestId: row.id,
    clientId: label.clientId,
    authorId: scope.userId,
    authorName: userName,
    side: "client",
    body: note,
    attachment: attachmentValue(attachment),
    createdAt: now,
  });
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: label.clientId,
    locationId: input.locationId,
    action: "reputation.request_survey",
    decision: "executed",
    reason: preview(note),
  });
  await notifyOthers(tx, scope, request, label.locationName, note, "New help request", deps);
  return row.id;
}
