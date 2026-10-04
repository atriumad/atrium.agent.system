import { type ConsumerDefinition, defineConsumer, featureGate } from "@atrium/core";
import type { Gateway } from "@atrium/policy";
import { z } from "zod";

export const RECOVERY = "host.recovery";

const Classification = z.object({
  severity: z.enum(["low", "medium", "high"]).nullable(),
  shouldOpen: z.boolean(),
});

/**
 * Recovery. Docs: agents / Host. Triggered by a survey response; labels how serious it is and,
 * when a person needs to step in, opens a private case and alerts the owner and the team. The
 * guest's comment is third-party text: this code never reads it, it only passes ids.
 */
export function recoveryAgent(gateway: Gateway) {
  const consumers: ConsumerDefinition[] = [
    defineConsumer({
      name: "host.recovery.read",
      event: "survey.response.submitted",
      options: { isEnabled: featureGate("reputation") },
      handler: async (event) => {
        const base = { agentId: RECOVERY, clientId: event.clientId, locationId: event.locationId };
        const classified = await gateway.call({
          ...base,
          tool: "reputation.classify_response",
          input: {
            responseId: event.data.responseId,
            reason: `read the survey response with a rating of ${event.data.rating} of 5`,
          },
        });
        // A refusal is a decision, not a failure: it is in the audit log and nothing retries.
        if (classified.decision !== "executed") return;

        const { severity, shouldOpen } = Classification.parse(classified.output);
        if (!shouldOpen || !severity) return;
        await gateway.call({
          ...base,
          tool: "reputation.open_case",
          input: {
            responseId: event.data.responseId,
            severity,
            reason: `a rating of ${event.data.rating} of 5 needs a person to follow up`,
          },
        });
      },
    }) as ConsumerDefinition,
  ];
  return { consumers, jobs: [] };
}
