import { z } from "zod";
import { defineTask, refusal } from "./task";

export const RECOVERY = "host.recovery";

const Classification = z.object({
  severity: z.enum(["low", "medium", "high"]).nullable(),
  shouldOpen: z.boolean(),
});

/**
 * Recovery. Docs: agents / Host. Triggered by a survey response, and again when its words have been
 * read; labels how serious it is and, when a person needs to step in, opens a private case and
 * alerts the owner and the team. The guest's comment is third-party text: this code never reads it,
 * it only passes ids. Opening is idempotent per response, so both triggers yield one case.
 */
export const recoveryEvaluate = defineTask({
  name: "recovery.evaluate",
  run: async (ctx, { clientId, locationId, input }) => {
    const base = { agentId: RECOVERY, clientId, locationId };
    const [readReason, openReason] =
      input.trigger === "submitted"
        ? [
            `read the survey response with a rating of ${input.rating} of 5`,
            `a rating of ${input.rating} of 5 needs a person to follow up`,
          ]
        : [
            `read the labels of a survey response (concern ${input.concern})`,
            `the reading of a survey response (concern ${input.concern}, safety ${input.safety}) needs a person to follow up`,
          ];

    const classified = await ctx.gateway.call({
      ...base,
      tool: "reputation.classify_response",
      input: { responseId: input.responseId, reason: readReason },
    });
    if (classified.decision !== "executed") return refusal(classified);

    const { severity, shouldOpen } = Classification.parse(classified.output);
    if (!shouldOpen || !severity) return { decision: "executed", result: { opened: false } };

    const opened = await ctx.gateway.call({
      ...base,
      tool: "reputation.open_case",
      input: { responseId: input.responseId, severity, reason: openReason },
    });
    if (opened.decision !== "executed") return refusal(opened);
    return { decision: "executed", result: { opened: true } };
  },
});
