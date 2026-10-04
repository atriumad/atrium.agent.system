import { type Tx } from "@atrium/core";
import { defineTool, reasonField, type Tool } from "@atrium/policy";
import { z } from "zod";
import { classifyResponse, openCase } from "../application/recovery";
import { sendReviewRequest } from "../application/requests";
import type { ReputationDeps } from "../application/shared";

/**
 * The tools Host's subagents act through. Each calls a use case in `application/`, takes ids and
 * a reason rather than free text, and returns a short typed result. They are specific and small:
 * `open_case`, not `update`.
 */
export type ReputationToolConfig = {
  /** Where survey links point: the public address of the API. */
  publicBaseUrl: string;
  /** Where alerts point the team: the admin address. Optional. */
  adminBaseUrl?: string;
} & Pick<ReputationDeps, "publish" | "transport">;

const uuid = z.string().uuid();
const severity = z.enum(["low", "medium", "high"]);

export function reputationTools(config: ReputationToolConfig): Tool<never, unknown, Tx>[] {
  const deps = (now: Date): ReputationDeps => ({
    now: () => now,
    ...(config.publish ? { publish: config.publish } : {}),
    ...(config.transport ? { transport: config.transport } : {}),
  });

  const classify = defineTool<
    { responseId: string; reason: string },
    { severity: string | null; shouldOpen: boolean },
    Tx
  >({
    name: "reputation.classify_response",
    description: "Reads a survey response and labels how serious it is. Changes only the label.",
    input: z.object({ responseId: uuid, reason: reasonField }),
    output: z.object({ severity: severity.nullable(), shouldOpen: z.boolean() }),
    writes: true,
    feature: "reputation",
    scopes: ["reputation:read", "reputation:write"],
    never: [
      {
        rule: "make the review link depend on the rating",
        enforcedBy:
          "the survey's final screen reads the link from the location only (flow.test: everyone gets the Google button)",
      },
    ],
    handler: async (input, _context, tx) => classifyResponse(tx, input.responseId),
  });

  const open = defineTool<
    { responseId: string; severity: "low" | "medium" | "high"; reason: string },
    { caseId: string; created: boolean; alerted: number },
    Tx
  >({
    name: "reputation.open_case",
    description:
      "Opens a private recovery case for a survey response and alerts the owner and the team.",
    input: z.object({ responseId: uuid, severity, reason: reasonField }),
    output: z.object({ caseId: uuid, created: z.boolean(), alerted: z.number().int() }),
    writes: true,
    feature: "reputation",
    scopes: ["reputation:read", "reputation:write"],
    never: [
      {
        rule: "open a case from a public review guessed to belong to a guest",
        enforcedBy: "the tool takes a survey response id, never a review (openCase)",
      },
    ],
    handler: async (input, context, tx) =>
      openCase(
        tx,
        { responseId: input.responseId, severity: input.severity, reason: input.reason },
        config.adminBaseUrl ? { adminBaseUrl: config.adminBaseUrl } : {},
        deps(context.now),
      ),
  });

  const send = defineTool<
    { requestId: string; reason: string },
    { outcome: "sent" | "skipped" | "already_handled"; reason?: string | undefined },
    Tx
  >({
    name: "reputation.send_review_request",
    description: "Sends one scheduled review request to a guest who agreed to be contacted.",
    input: z.object({ requestId: uuid, reason: reasonField }),
    output: z.object({
      outcome: z.enum(["sent", "skipped", "already_handled"]),
      reason: z.string().optional(),
    }),
    writes: true,
    feature: "reputation",
    scopes: ["reputation:write", "guests:contact_if_consented"],
    never: [
      {
        rule: "filter who is asked for a review by their experience",
        enforcedBy:
          "the tool takes a request id and no rating; every identified visit is scheduled (scheduleReviewRequest)",
      },
      {
        rule: "write to a guest without recorded consent",
        enforcedBy:
          "sendToGuest checks consent for the channel and purpose (flow.test: no consent means no message)",
      },
    ],
    handler: async (input, context, tx) => {
      const result = await sendReviewRequest(
        tx,
        input.requestId,
        { publicBaseUrl: config.publicBaseUrl },
        deps(context.now),
      );
      return result.outcome === "skipped"
        ? { outcome: "skipped", reason: result.reason }
        : { outcome: result.outcome };
    },
  });

  return [classify, open, send] as unknown as Tool<never, unknown, Tx>[];
}
