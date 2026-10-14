import type { HelpAttachment } from "@atrium/contracts";
import { alertRecipients, locationVisible, type Scope, sendToUser, type Tx } from "@atrium/core";
import { and, eq, type SQL, sql } from "drizzle-orm";
import { preview } from "../domain/help";
import { surveyResponses } from "../infra/schema";
import type { ReputationDeps } from "./shared";

export class HelpAttachmentError extends Error {}

/**
 * Validates an attachment against what the author may see and returns what is stored. A response
 * is stored by id only; it must belong to the request's client and to a location the author can see.
 * A review was already shape-checked by the contract, so it is stored as given.
 */
export async function checkAttachment(
  tx: Tx,
  scope: Scope,
  clientId: string,
  attachment: HelpAttachment | null,
): Promise<HelpAttachment | null> {
  if (!attachment) return null;
  if (attachment.kind === "review") return attachment;
  const [row] = await tx
    .select({ id: surveyResponses.id, locationId: surveyResponses.locationId })
    .from(surveyResponses)
    .where(
      and(eq(surveyResponses.id, attachment.responseId), eq(surveyResponses.clientId, clientId)),
    );
  if (!row || !locationVisible(scope, row.locationId)) {
    throw new HelpAttachmentError("that response is not available");
  }
  return { kind: "response", responseId: row.id };
}

/** Bun's driver sends a bound object as a JSON string; going through text keeps it a jsonb object. */
export function attachmentValue(attachment: HelpAttachment | null): SQL | null {
  return attachment ? sql`${JSON.stringify(attachment)}::text::jsonb` : null;
}

/** Tells everyone who handles this client except the author. The body carries a short preview only. */
export async function notifyOthers(
  tx: Tx,
  scope: Scope,
  request: { id: string; clientId: string },
  locationName: string,
  text: string,
  subject: string,
  deps: ReputationDeps = {},
): Promise<number> {
  let sent = 0;
  for (const recipient of await alertRecipients(tx, request.clientId)) {
    if (recipient.userId === scope.userId) continue;
    const result = await sendToUser(
      tx,
      {
        clientId: request.clientId,
        userId: recipient.userId,
        kind: "reputation.help_message",
        subject: `${subject} · ${locationName}`,
        body: preview(text),
      },
      deps.transport,
    );
    if (result.sent) sent += 1;
  }
  return sent;
}
