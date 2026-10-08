import { SURVEY_TEMPLATE_VERSION, type SurveySubmission } from "@atrium/contracts";
import {
  type Database,
  IdentityConflictError,
  InvalidContactError,
  listLocations,
  locationStatusFor,
  recordConsent,
  resolveGuest,
  type Tx,
  withTenant,
} from "@atrium/core";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  DEVICE_WINDOW_HOURS,
  hashInvitationToken,
  invitationState,
  looksLikeInvitationToken,
} from "../domain/invitations";
import { surveyInvitations, surveyResponses } from "../infra/schema";
import { getLocationSettings } from "./settings";
import { clock, envelope, type ReputationDeps } from "./shared";

export class InvitationUnavailableError extends Error {
  constructor(readonly reason: "unknown" | "expired" | "used") {
    super(`survey link is ${reason}`);
  }
}
export class DeviceLimitError extends Error {}
export class InvalidSubmissionError extends Error {}

export type SurveyTarget = {
  clientId: string;
  locationId: string;
  locationName: string;
  invitationId: string | null;
  guestId: string | null;
};

/** What the survey page needs to show, or why the link cannot be used. Runs before any scope. */
export async function resolveInvitation(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<
  { ok: true; target: SurveyTarget } | { ok: false; reason: "unknown" | "expired" | "used" }
> {
  if (!looksLikeInvitationToken(token)) return { ok: false, reason: "unknown" };
  const rows = await db.execute<{
    id: string;
    client_id: string;
    location_id: string;
    guest_id: string | null;
    expires_at: Date | string;
    used_at: Date | string | null;
  }>(sql`select * from reputation.resolve_invitation(${hashInvitationToken(token)})`);
  const row = rows[0];
  if (!row) return { ok: false, reason: "unknown" };

  // A location that is not active is gone as far as a guest is concerned.
  if ((await locationStatusFor(db, row.location_id)) !== "active") {
    return { ok: false, reason: "unknown" };
  }

  const state = invitationState(
    { expiresAt: new Date(row.expires_at), usedAt: row.used_at ? new Date(row.used_at) : null },
    now,
  );
  if (state !== "valid") return { ok: false, reason: state };

  const locationName = await withTenant(db, row.client_id, async (tx) => {
    const location = (await listLocations(tx, row.client_id)).find((l) => l.id === row.location_id);
    return location?.name ?? "the restaurant";
  });
  return {
    ok: true,
    target: {
      clientId: row.client_id,
      locationId: row.location_id,
      locationName,
      invitationId: row.id,
      guestId: row.guest_id,
    },
  };
}

export type SubmitSource =
  | { kind: "invitation"; token: string }
  | { kind: "qr"; clientId: string; locationId: string; deviceHash: string };

export type SubmitResult = {
  responseId: string;
  /** The Google review link, for the final screen. Null only if the location has none. */
  reviewUrl: string | null;
};

/**
 * Stores one survey response. An invitation works once (claimed atomically); a QR is anonymous
 * and limited to one submission per device per window. Contact details count only when the guest
 * asked to be contacted, and become a Core guest with a consent to be reached about this.
 */
export async function submitSurvey(
  db: Database,
  source: SubmitSource,
  input: SurveySubmission,
  deps: ReputationDeps = {},
): Promise<SubmitResult> {
  const now = clock(deps);
  let target: SurveyTarget;
  if (source.kind === "invitation") {
    const resolved = await resolveInvitation(db, source.token, now);
    if (!resolved.ok) throw new InvitationUnavailableError(resolved.reason);
    target = resolved.target;
  } else {
    if ((await locationStatusFor(db, source.locationId)) !== "active") {
      throw new InvitationUnavailableError("unknown");
    }
    target = {
      clientId: source.clientId,
      locationId: source.locationId,
      locationName: "",
      invitationId: null,
      guestId: null,
    };
  }

  return withTenant(db, target.clientId, async (tx) => {
    if (source.kind === "invitation") {
      const claimed = await tx
        .update(surveyInvitations)
        .set({ usedAt: now })
        .where(
          and(
            eq(surveyInvitations.id, target.invitationId as string),
            isNull(surveyInvitations.usedAt),
            gt(surveyInvitations.expiresAt, now),
          ),
        )
        .returning({ id: surveyInvitations.id });
      if (claimed.length === 0) throw new InvitationUnavailableError("used");
    } else {
      const since = new Date(now.getTime() - DEVICE_WINDOW_HOURS * 3_600_000);
      const recent = await tx
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.locationId, target.locationId),
            eq(surveyResponses.deviceHash, source.deviceHash),
            gt(surveyResponses.createdAt, since),
          ),
        )
        .limit(1);
      if (recent.length > 0) throw new DeviceLimitError("this device already answered");
    }

    const guestId = await guestFor(tx, target, input);
    const [response] = await tx
      .insert(surveyResponses)
      .values({
        clientId: target.clientId,
        locationId: target.locationId,
        invitationId: target.invitationId,
        guestId,
        deviceHash: source.kind === "qr" ? source.deviceHash : null,
        templateVersion: SURVEY_TEMPLATE_VERSION,
        rating: input.rating,
        bestPart: input.bestPart,
        improve: input.improve,
        comment: input.comment,
        wantsContact: input.wantsContact,
        createdAt: now,
      })
      .returning({ id: surveyResponses.id });
    if (!response) throw new Error("response was not stored");

    await deps.publish?.(
      {
        ...envelope(target.clientId, target.locationId, now),
        type: "survey.response.submitted",
        version: 1,
        data: { responseId: response.id, rating: input.rating, wantsContact: input.wantsContact },
      },
      tx,
    );
    const settings = await getLocationSettings(tx, target.locationId);
    return { responseId: response.id, reviewUrl: settings.reviewUrl };
  });
}

/**
 * The guest behind a response: the one the invitation was sent to, or the one who left contact
 * details. Details are read only when the guest asked to be contacted. A clash with another
 * guest never fails the survey: the answer matters more than the link between records.
 */
async function guestFor(
  tx: Tx,
  target: SurveyTarget,
  input: SurveySubmission,
): Promise<string | null> {
  if (!input.wantsContact || (!input.contactEmail && !input.contactPhone)) return target.guestId;
  try {
    const guestId = await resolveGuest(tx, target.clientId, {
      ...(input.contactEmail ? { email: input.contactEmail } : {}),
      ...(input.contactPhone ? { phone: input.contactPhone } : {}),
      ...(input.contactName ? { name: input.contactName } : {}),
    });
    // They asked to be contacted about this visit: a service message, on the channel they gave.
    if (input.contactEmail) await recordConsent(tx, guestId, "email", "transactional", "survey");
    if (input.contactPhone) await recordConsent(tx, guestId, "sms", "transactional", "survey");
    return guestId;
  } catch (error) {
    if (error instanceof InvalidContactError) {
      throw new InvalidSubmissionError("that email or phone does not look right");
    }
    if (error instanceof IdentityConflictError) return target.guestId;
    throw error;
  }
}

/**
 * The Google button was tapped. Records the first tap and returns where to send the guest.
 * Public and keyed by the response id, which cannot be guessed; the id only lets someone record
 * a tap, never read anything.
 */
export async function recordReviewClick(
  db: Database,
  responseId: string,
  deps: ReputationDeps = {},
): Promise<string | null> {
  const found = await db.execute<{ client_id: string; location_id: string }>(
    sql`select * from reputation.resolve_response(${responseId}::uuid)`,
  );
  const row = found[0];
  if (!row) return null;
  const now = clock(deps);
  return withTenant(db, row.client_id, async (tx) => {
    const first = await tx
      .update(surveyResponses)
      .set({ reviewClickedAt: now })
      .where(and(eq(surveyResponses.id, responseId), isNull(surveyResponses.reviewClickedAt)))
      .returning({ id: surveyResponses.id });
    if (first.length > 0) {
      await deps.publish?.(
        {
          ...envelope(row.client_id, row.location_id, now),
          type: "review.link.clicked",
          version: 1,
          data: { responseId },
        },
        tx,
      );
    }
    return (await getLocationSettings(tx, row.location_id)).reviewUrl;
  });
}
