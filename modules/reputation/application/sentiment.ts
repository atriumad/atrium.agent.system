// modules/reputation/application/sentiment.ts
import type { Tx } from "@atrium/core";
import { and, eq, isNull } from "drizzle-orm";
import { Reading, storedReading } from "../domain/sentiment";
import { surveyResponses } from "../infra/schema";
import { CaseNotFoundError } from "./recovery";
import { clock, envelope, type ReputationDeps } from "./shared";

/** The only fields of a response the model sees. No guest id, name or contact. */
export type ReaderInput = {
  rating: number;
  bestPart: string | null;
  improve: string | null;
  comment: string | null;
};

/** The model, behind a port. The adapter lives in `apps/agents`; tests pass a fake. */
export type ResponseReader = {
  /** Stored with every reading, so a label can be traced to the model that wrote it. */
  model: string;
  read(input: ReaderInput): Promise<unknown>;
};

export class ReadingInvalidError extends Error {}

export type ReadOutcome = {
  status: "read" | "already_read" | "no_text";
  sentiment: Reading["sentiment"] | null;
  concern: Reading["concern"] | null;
  safety: boolean | null;
};

const alreadyRead = (r: Reading): ReadOutcome => ({
  status: "already_read",
  sentiment: r.sentiment,
  concern: r.concern,
  safety: r.safety,
});

const none = (status: ReadOutcome["status"]): ReadOutcome => ({
  status,
  sentiment: null,
  concern: null,
  safety: null,
});

/**
 * Sentiment's reading of a response: asks the model what the guest's words say, keeps only the
 * labels and announces it. Changes nothing but those labels, so running it twice is harmless:
 * a response that was already read answers from what is stored, and the write only lands on a row
 * that is still unread. Under a race the model may be called twice; only one reading is kept.
 * A response with no comment has nothing to read and never reaches the model.
 */
export async function readResponse(
  tx: Tx,
  reader: ResponseReader,
  responseId: string,
  deps: ReputationDeps = {},
): Promise<ReadOutcome> {
  const now = clock(deps);
  const [response] = await tx
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.id, responseId));
  if (!response) throw new CaseNotFoundError("response not found");

  const existing = response.readAt ? storedReading(response) : null;
  if (existing) return alreadyRead(existing);
  if (!response.comment?.trim()) return none("no_text");

  const raw = await reader.read({
    rating: response.rating,
    bestPart: response.bestPart,
    improve: response.improve,
    comment: response.comment,
  });
  const parsed = Reading.safeParse(raw);
  if (!parsed.success) {
    throw new ReadingInvalidError("the reader answered outside the allowed labels");
  }
  const reading = { ...parsed.data, topics: [...new Set(parsed.data.topics)] };

  // No row lock is held across the model call: it would block Recovery's update of the same row for
  // as long as the model takes. Whoever writes first wins; a concurrent reader answers from that.
  const written = await tx
    .update(surveyResponses)
    .set({
      sentiment: reading.sentiment,
      topics: reading.topics,
      concern: reading.concern,
      safety: reading.safety,
      readAt: now,
      readModel: reader.model,
    })
    .where(and(eq(surveyResponses.id, responseId), isNull(surveyResponses.readAt)))
    .returning({ id: surveyResponses.id });
  if (written.length === 0) {
    const [current] = await tx
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, responseId));
    const stored = current?.readAt ? storedReading(current) : null;
    if (!stored) throw new ReadingInvalidError("the response changed while it was being read");
    return alreadyRead(stored);
  }

  await deps.publish?.(
    {
      ...envelope(response.clientId, response.locationId, now),
      type: "survey.response.read",
      version: 1,
      data: {
        responseId,
        sentiment: reading.sentiment,
        concern: reading.concern,
        safety: reading.safety,
      },
    },
    tx,
  );
  return {
    status: "read",
    sentiment: reading.sentiment,
    concern: reading.concern,
    safety: reading.safety,
  };
}
