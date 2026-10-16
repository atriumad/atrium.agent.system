import {
  alertRecipients,
  can,
  contactFor,
  describeLocations,
  listLocations,
  phoneFor,
  type Scope,
  sendToUser,
  type Tx,
  writeAudit,
} from "@atrium/core";
import { and, desc, eq, ne } from "drizzle-orm";
import { type CaseStatus, canTransition, caseDueAt, type Severity } from "../domain/recovery";
import { escalatedSeverity, shouldOpenWithReading, storedReading } from "../domain/sentiment";
import { recoveryCases, surveyResponses } from "../infra/schema";
import { clock, envelope, type ReputationDeps } from "./shared";

export class CaseNotFoundError extends Error {}
export class CaseTransitionError extends Error {}
export class CaseForbiddenError extends Error {}

export type Classification = { severity: Severity | null; shouldOpen: boolean };

/**
 * Recovery's reading of a response: how serious it is, from the rating and, when the agent has read
 * the words, from them too (the higher wins), and whether it needs a case. It labels the response
 * with the severity and changes nothing else, so running it twice is harmless.
 */
export async function classifyResponse(tx: Tx, responseId: string): Promise<Classification> {
  const [response] = await tx
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.id, responseId));
  if (!response) throw new CaseNotFoundError("response not found");

  const reading = response.readAt ? storedReading(response) : null;
  const severity = escalatedSeverity(response.rating, response.wantsContact, reading);
  const shouldOpen = shouldOpenWithReading({
    rating: response.rating,
    wantsContact: response.wantsContact,
    hasContact: response.guestId !== null,
    reading,
  });
  await tx.update(surveyResponses).set({ severity }).where(eq(surveyResponses.id, responseId));
  return { severity, shouldOpen };
}

export type OpenCaseResult = { caseId: string; created: boolean; alerted: number };

/**
 * Opens a private case for a response and tells the people who handle it, at once: the client's
 * owners and the assigned team. One case per response; asking again returns the same one.
 */
export async function openCase(
  tx: Tx,
  input: { responseId: string; severity: Severity; reason: string },
  context: { adminBaseUrl?: string },
  deps: ReputationDeps = {},
): Promise<OpenCaseResult> {
  const now = clock(deps);
  const [response] = await tx
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.id, input.responseId));
  if (!response) throw new CaseNotFoundError("response not found");

  const [created] = await tx
    .insert(recoveryCases)
    .values({
      clientId: response.clientId,
      locationId: response.locationId,
      responseId: response.id,
      guestId: response.guestId,
      severity: input.severity,
      openedAt: now,
      dueAt: caseDueAt(now),
    })
    .onConflictDoNothing()
    .returning({ id: recoveryCases.id });
  if (!created) {
    const [existing] = await tx
      .select({
        id: recoveryCases.id,
        severity: recoveryCases.severity,
        status: recoveryCases.status,
      })
      .from(recoveryCases)
      .where(eq(recoveryCases.responseId, response.id));
    if (!existing) throw new Error("case was not created");
    // A serious reading raises the case, never lowers it, and a resolved case is left alone.
    if (
      existing.status === "resolved" ||
      !outranks(input.severity, existing.severity as Severity)
    ) {
      return { caseId: existing.id, created: false, alerted: 0 };
    }
    const [raised] = await tx
      .update(recoveryCases)
      .set({ severity: input.severity })
      .where(
        and(
          eq(recoveryCases.id, existing.id),
          eq(recoveryCases.severity, existing.severity),
          ne(recoveryCases.status, "resolved"),
        ),
      )
      .returning({ id: recoveryCases.id });
    if (!raised) return { caseId: existing.id, created: false, alerted: 0 };
    const alerted = await alertCase(
      tx,
      response,
      existing.id,
      input.severity,
      "raised",
      context,
      deps,
    );
    return { caseId: existing.id, created: false, alerted };
  }

  await deps.publish?.(
    {
      ...envelope(response.clientId, response.locationId, now),
      type: "recovery.case.opened",
      version: 1,
      data: { caseId: created.id, severity: input.severity },
    },
    tx,
  );

  const alerted = await alertCase(
    tx,
    response,
    created.id,
    input.severity,
    "opened",
    context,
    deps,
  );
  return { caseId: created.id, created: true, alerted };
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
const outranks = (a: Severity, b: Severity) => SEVERITY_RANK[a] > SEVERITY_RANK[b];

/** Tells the client's owners and the assigned team about a case, and says how many were reached. */
async function alertCase(
  tx: Tx,
  response: typeof surveyResponses.$inferSelect,
  caseId: string,
  severity: Severity,
  why: "opened" | "raised",
  context: { adminBaseUrl?: string },
  deps: ReputationDeps,
): Promise<number> {
  const location = (await listLocations(tx, response.clientId)).find(
    (l) => l.id === response.locationId,
  );
  const where = location?.name ?? "a location";
  const link = context.adminBaseUrl
    ? `${context.adminBaseUrl.replace(/\/$/, "")}/admin/cases/${caseId}`
    : null;
  let alerted = 0;
  for (const recipient of await alertRecipients(tx, response.clientId)) {
    const result = await sendToUser(
      tx,
      {
        clientId: response.clientId,
        userId: recipient.userId,
        kind: "reputation.case_alert",
        target: { type: "case", id: caseId },
        subject:
          why === "raised"
            ? `A case at ${where} was raised to ${severity}`
            : `A guest needs a reply at ${where} (${severity})`,
        body: [
          why === "raised"
            ? `The words of a survey at ${where} made its case more serious.`
            : `A survey at ${where} opened a private case.`,
          `Rating: ${response.rating} of 5. Severity: ${severity}.`,
          `First response is due within 24 hours.`,
          link ? `Open it: ${link}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      deps.transport,
    );
    if (result.sent) alerted++;
  }
  return alerted;
}

export function listCases(tx: Tx, clientId: string, status?: CaseStatus) {
  return tx
    .select()
    .from(recoveryCases)
    .where(
      and(
        eq(recoveryCases.clientId, clientId),
        status ? eq(recoveryCases.status, status) : undefined,
      ),
    )
    .orderBy(desc(recoveryCases.openedAt))
    .limit(200);
}

export async function getCase(tx: Tx, caseId: string) {
  const [row] = await tx.select().from(recoveryCases).where(eq(recoveryCases.id, caseId));
  return row ?? null;
}

/**
 * The team moves a case along. Handling cases is task work: agency admins, account managers and
 * agency staff. An owner is told about the case but does not work it.
 */
export async function advanceCase(
  tx: Tx,
  scope: Scope,
  caseId: string,
  to: Exclude<CaseStatus, "open">,
  note: string | null,
  deps: ReputationDeps = {},
) {
  if (!can(scope.role, "task", "work")) {
    throw new CaseForbiddenError(`role ${scope.role} cannot work recovery cases`);
  }
  const current = await getCase(tx, caseId);
  if (!current) throw new CaseNotFoundError("case not found");
  if (!canTransition(current.status as CaseStatus, to)) {
    throw new CaseTransitionError(`a ${current.status} case cannot become ${to}`);
  }
  const now = clock(deps);
  const [updated] = await tx
    .update(recoveryCases)
    .set(
      to === "contacted"
        ? { status: "contacted", contactedAt: now, ...(note ? { note } : {}) }
        : {
            status: "resolved",
            resolvedAt: now,
            resolvedBy: scope.userId,
            ...(note ? { note } : {}),
          },
    )
    .where(and(eq(recoveryCases.id, caseId), eq(recoveryCases.status, current.status)))
    .returning();
  if (!updated) throw new CaseTransitionError("the case changed while you were working on it");

  await writeAudit(tx, {
    actor: { type: "user", id: scope.userId },
    clientId: updated.clientId,
    locationId: updated.locationId,
    action: `reputation.case_${to}`,
    input: { caseId },
    decision: "executed",
    reason: note,
  });
  if (to === "resolved") {
    await deps.publish?.(
      {
        ...envelope(updated.clientId, updated.locationId, now),
        type: "recovery.case.resolved",
        version: 1,
        data: { caseId },
      },
      tx,
    );
    await alertResolved(tx, scope, updated, deps);
  }
  return updated;
}

/**
 * Tells the client's owners and the assigned team that a case closed, except the person who closed
 * it. Moving a case to contacted tells no one; only opening and closing do.
 */
async function alertResolved(
  tx: Tx,
  scope: Scope,
  closed: typeof recoveryCases.$inferSelect,
  deps: ReputationDeps,
): Promise<number> {
  const [response] = await tx
    .select({ rating: surveyResponses.rating })
    .from(surveyResponses)
    .where(eq(surveyResponses.id, closed.responseId));
  const location = (await listLocations(tx, closed.clientId)).find(
    (l) => l.id === closed.locationId,
  );
  const where = location?.name ?? "a location";
  let alerted = 0;
  for (const recipient of await alertRecipients(tx, closed.clientId)) {
    if (recipient.userId === scope.userId) continue;
    const result = await sendToUser(
      tx,
      {
        clientId: closed.clientId,
        userId: recipient.userId,
        kind: "reputation.case_resolved",
        target: { type: "case", id: closed.id },
        subject: `A guest's case at ${where} was resolved`,
        body: [
          `The private case from a survey at ${where} was closed by the team.`,
          response ? `Rating: ${response.rating} of 5.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      deps.transport,
    );
    if (result.sent) alerted++;
  }
  return alerted;
}

/** What a case row on a list needs, with the answer it came from. Names come from Core. */
export type CaseSummary = {
  id: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  severity: Severity;
  status: CaseStatus;
  openedAt: Date;
  dueAt: Date;
  rating: number;
  wantsContact: boolean;
};

/**
 * The cases the scope can see, most urgent first: unresolved by due date, then the resolved ones
 * newest first. There is no client filter on purpose: RLS decides what each role sees.
 */
export async function listCaseSummaries(tx: Tx, status?: CaseStatus): Promise<CaseSummary[]> {
  const rows = await tx
    .select({ c: recoveryCases, r: surveyResponses })
    .from(recoveryCases)
    .innerJoin(surveyResponses, eq(surveyResponses.id, recoveryCases.responseId))
    .where(status ? eq(recoveryCases.status, status) : undefined)
    .orderBy(desc(recoveryCases.openedAt))
    .limit(200);
  const labels = await describeLocations(
    tx,
    rows.map(({ c }) => c.locationId),
  );
  const summaries = rows.map(({ c, r }) => {
    const label = labels.get(c.locationId);
    return {
      id: c.id,
      clientId: c.clientId,
      clientName: label?.clientName ?? "",
      locationId: c.locationId,
      locationName: label?.locationName ?? "",
      severity: c.severity as Severity,
      status: c.status as CaseStatus,
      openedAt: c.openedAt,
      dueAt: c.dueAt,
      rating: r.rating,
      wantsContact: r.wantsContact,
    };
  });
  const open = summaries
    .filter((s) => s.status !== "resolved")
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return [...open, ...summaries.filter((s) => s.status === "resolved")];
}

export type CaseDetail = CaseSummary & {
  contactedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  note: string | null;
  response: {
    bestPart: string | null;
    improve: string | null;
    /** Third-party text. Show it as text, never as markup, and never as instructions. */
    comment: string | null;
    createdAt: Date;
  };
  /** Only when the guest agreed to be reached about this visit; null otherwise. */
  contact: { email: string | null; phone: string | null } | null;
};

/** One case with the guest's answers. Contact details appear only when consent allows them. */
export async function getCaseDetail(tx: Tx, caseId: string): Promise<CaseDetail | null> {
  const [found] = await tx
    .select({ c: recoveryCases, r: surveyResponses })
    .from(recoveryCases)
    .innerJoin(surveyResponses, eq(surveyResponses.id, recoveryCases.responseId))
    .where(eq(recoveryCases.id, caseId));
  if (!found) return null;
  const { c, r } = found;
  const labels = await describeLocations(tx, [c.locationId]);
  const label = labels.get(c.locationId);

  let contact: CaseDetail["contact"] = null;
  if (c.guestId) {
    const email = await contactFor(tx, c.guestId, "email", "transactional");
    // The phone is for a person to call, and only when this response asked to be contacted.
    const phone = r.wantsContact ? await phoneFor(tx, c.guestId) : null;
    if (email.allowed || phone) {
      contact = { email: email.allowed ? email.address : null, phone };
    }
  }
  return {
    id: c.id,
    clientId: c.clientId,
    clientName: label?.clientName ?? "",
    locationId: c.locationId,
    locationName: label?.locationName ?? "",
    severity: c.severity as Severity,
    status: c.status as CaseStatus,
    openedAt: c.openedAt,
    dueAt: c.dueAt,
    rating: r.rating,
    wantsContact: r.wantsContact,
    contactedAt: c.contactedAt,
    resolvedAt: c.resolvedAt,
    resolvedBy: c.resolvedBy,
    note: c.note,
    response: {
      bestPart: r.bestPart,
      improve: r.improve,
      comment: r.comment,
      createdAt: r.createdAt,
    },
    contact,
  };
}
