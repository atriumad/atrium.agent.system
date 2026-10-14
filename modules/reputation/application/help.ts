import type { HelpAttachment } from "@atrium/contracts";
import {
  can,
  describeLocations,
  locationVisible,
  type Scope,
  type Tx,
  writeAudit,
} from "@atrium/core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { canCloseAs, type HelpSide, preview } from "../domain/help";
import { surveyRequestMessages, surveyRequests, surveyResponses } from "../infra/schema";
import {
  actorOf,
  SurveyForbiddenError,
  SurveyNotFoundError,
  type SurveyRequestRow,
  SurveyStateError,
  toRequestRow,
} from "./admin";
import { attachmentValue, checkAttachment, HelpAttachmentError, notifyOthers } from "./help-shared";
import { clock, type ReputationDeps } from "./shared";

export { HelpAttachmentError };

export type ResponseCard = {
  id: string;
  locationName: string;
  rating: number;
  comment: string | null;
  bestPart: string | null;
  improve: string | null;
  sentiment: string | null;
  topics: string[];
  concern: string | null;
  safety: boolean | null;
  createdAt: Date;
};
export type ThreadAttachment =
  | { kind: "response"; response: ResponseCard | null }
  | { kind: "review"; url: string; rating: number | null; text: string | null };
export type ThreadMessage = {
  id: string;
  authorName: string;
  side: HelpSide;
  body: string;
  attachment: ThreadAttachment | null;
  createdAt: Date;
};
export type Thread = { request: SurveyRequestRow; messages: ThreadMessage[] };

/** Agency roles write for the agency; a client owner writes for the client; nobody else writes. */
function sideOf(scope: Scope): HelpSide {
  if (can(scope.role, "survey", "manage")) return "agency";
  if (can(scope.role, "survey", "request")) return "client";
  throw new SurveyForbiddenError(`role ${scope.role} cannot write in help requests`);
}

function assertCanRead(scope: Scope) {
  if (!can(scope.role, "survey", "forms") && !can(scope.role, "survey", "request")) {
    throw new SurveyForbiddenError(`role ${scope.role} cannot see help requests`);
  }
}

/** `lock` takes the row for update, so a message and a close on the same request run one after the other. */
async function loadRequest(tx: Tx, requestId: string, opts: { lock?: boolean } = {}) {
  const query = tx.select().from(surveyRequests).where(eq(surveyRequests.id, requestId));
  const [request] = await (opts.lock ? query.for("update") : query);
  if (!request) throw new SurveyNotFoundError("request not found");
  return request;
}

async function resolveMessages(
  tx: Tx,
  rows: (typeof surveyRequestMessages.$inferSelect)[],
): Promise<ThreadMessage[]> {
  const responseIds = rows.flatMap((m) => {
    const a = m.attachment as HelpAttachment | null;
    return a?.kind === "response" ? [a.responseId] : [];
  });
  const responses = responseIds.length
    ? await tx.select().from(surveyResponses).where(inArray(surveyResponses.id, responseIds))
    : [];
  const labels = await describeLocations(tx, [...new Set(responses.map((r) => r.locationId))]);
  const cards = new Map<string, ResponseCard>(
    responses.map((r) => [
      r.id,
      {
        id: r.id,
        locationName: labels.get(r.locationId)?.locationName ?? "",
        rating: r.rating,
        comment: r.comment,
        bestPart: r.bestPart,
        improve: r.improve,
        sentiment: r.sentiment,
        topics: r.topics ?? [],
        concern: r.concern,
        safety: r.safety,
        createdAt: r.createdAt,
      },
    ]),
  );
  return rows.map((m) => {
    const a = m.attachment as HelpAttachment | null;
    const attachment: ThreadAttachment | null = !a
      ? null
      : a.kind === "response"
        ? { kind: "response", response: cards.get(a.responseId) ?? null }
        : { kind: "review", url: a.url, rating: a.rating ?? null, text: a.text ?? null };
    return {
      id: m.id,
      authorName: m.authorName,
      side: m.side as HelpSide,
      body: m.body,
      attachment,
      createdAt: m.createdAt,
    };
  });
}

export async function getThread(tx: Tx, scope: Scope, requestId: string): Promise<Thread> {
  assertCanRead(scope);
  const request = await loadRequest(tx, requestId);
  const labels = await describeLocations(tx, [request.locationId]);
  const rows = await tx
    .select()
    .from(surveyRequestMessages)
    .where(eq(surveyRequestMessages.requestId, requestId))
    .orderBy(asc(surveyRequestMessages.createdAt), asc(surveyRequestMessages.side));
  return { request: toRequestRow(request, labels), messages: await resolveMessages(tx, rows) };
}

export async function postMessage(
  tx: Tx,
  scope: Scope,
  userName: string,
  requestId: string,
  input: { body: string; attachment?: HelpAttachment | null },
  deps: ReputationDeps = {},
): Promise<ThreadMessage> {
  const side = sideOf(scope);
  const body = input.body.trim();
  if (!body) throw new Error("the request needs a message");
  const request = await loadRequest(tx, requestId, { lock: true });
  const attachment = await checkAttachment(tx, scope, request.clientId, input.attachment ?? null);
  const now = clock(deps);
  const [row] = await tx
    .insert(surveyRequestMessages)
    .values({
      requestId,
      clientId: request.clientId,
      authorId: scope.userId,
      authorName: userName,
      side,
      body,
      attachment: attachmentValue(attachment),
      createdAt: now,
    })
    .returning();
  if (!row) throw new Error("message was not stored");
  const reopened = request.status !== "open";
  await tx
    .update(surveyRequests)
    .set({
      lastMessageAt: now,
      lastAuthorSide: side,
      lastPreview: preview(body),
      ...(reopened ? { status: "open", handledAt: null, handledBy: null } : {}),
    })
    .where(eq(surveyRequests.id, requestId));
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: request.clientId,
    locationId: request.locationId,
    action: "reputation.help_message_posted",
    input: { requestId, side, attached: attachment?.kind ?? null, reopened },
    decision: "executed",
  });
  const label = (await describeLocations(tx, [request.locationId])).get(request.locationId);
  await notifyOthers(
    tx,
    scope,
    request,
    label?.locationName ?? "a place",
    body,
    "New message",
    deps,
  );
  return (await resolveMessages(tx, [row]))[0] as ThreadMessage;
}

export async function closeRequest(
  tx: Tx,
  scope: Scope,
  userName: string,
  requestId: string,
  to: "fulfilled" | "dismissed",
  message: string | null,
  deps: ReputationDeps = {},
): Promise<void> {
  const side = sideOf(scope);
  if (!canCloseAs(side, to)) {
    throw new SurveyForbiddenError(`the ${side} cannot close a request as ${to}`);
  }
  const request = await loadRequest(tx, requestId);
  const now = clock(deps);
  const closing = message?.trim() || null;
  // One winner when two people close at once: only an open request is updated.
  const closed = await tx
    .update(surveyRequests)
    .set({
      status: to,
      handledAt: now,
      handledBy: scope.userId,
      ...(closing
        ? {
            lastMessageAt: now,
            lastAuthorSide: side,
            lastPreview: preview(closing),
          }
        : {}),
    })
    .where(and(eq(surveyRequests.id, requestId), eq(surveyRequests.status, "open")))
    .returning({ id: surveyRequests.id });
  if (closed.length === 0) {
    throw new SurveyStateError(
      `the request is already ${request.status === "open" ? "closed" : request.status}`,
    );
  }
  if (closing) {
    await tx.insert(surveyRequestMessages).values({
      requestId,
      clientId: request.clientId,
      authorId: scope.userId,
      authorName: userName,
      side,
      body: closing,
      attachment: null,
      createdAt: now,
    });
  }
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: request.clientId,
    locationId: request.locationId,
    action: `reputation.help_closed_${to}`,
    input: { requestId },
    decision: "executed",
    reason: closing,
  });
  const label = (await describeLocations(tx, [request.locationId])).get(request.locationId);
  await notifyOthers(
    tx,
    scope,
    request,
    label?.locationName ?? "a place",
    closing ?? (to === "fulfilled" ? "Marked as solved." : "Declined."),
    to === "fulfilled" ? "Request solved" : "Request declined",
    deps,
  );
}

export type PickableResponse = {
  id: string;
  createdAt: Date;
  rating: number;
  excerpt: string;
  locationId: string;
  locationName: string;
};

/**
 * The recent responses a person can attach. With `requestId` the list is the request's client only
 * (an account manager with several clients never sees the others here); `id` finds one response.
 */
export async function listPickableResponses(
  tx: Tx,
  scope: Scope,
  filter: { locationId?: string; requestId?: string; id?: string } = {},
): Promise<PickableResponse[]> {
  assertCanRead(scope);
  const clientId = filter.requestId ? (await loadRequest(tx, filter.requestId)).clientId : null;
  const rows = await tx
    .select()
    .from(surveyResponses)
    .where(
      and(
        filter.locationId ? eq(surveyResponses.locationId, filter.locationId) : undefined,
        filter.id ? eq(surveyResponses.id, filter.id) : undefined,
        clientId ? eq(surveyResponses.clientId, clientId) : undefined,
      ),
    )
    .orderBy(desc(surveyResponses.createdAt))
    .limit(60);
  const visible = rows.filter((r) => locationVisible(scope, r.locationId)).slice(0, 20);
  const labels = await describeLocations(tx, [...new Set(visible.map((r) => r.locationId))]);
  return visible.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    rating: r.rating,
    excerpt: preview(r.comment ?? "(no comment)", 60),
    locationId: r.locationId,
    locationName: labels.get(r.locationId)?.locationName ?? "",
  }));
}
