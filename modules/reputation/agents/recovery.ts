import { type ConsumerDefinition, defineConsumer, featureGate } from "@atrium/core";
import type { Gateway } from "@atrium/policy";
import { z } from "zod";

export const RECOVERY = "host.recovery";

const Classification = z.object({
  severity: z.enum(["low", "medium", "high"]).nullable(),
  shouldOpen: z.boolean(),
});

/**
 * Recovery. Docs: agents / Host. Triggered by a survey response, and again when its words have
 * been read; labels how serious it is and, when a person needs to step in, opens a private case
 * and alerts the owner and the team. The guest's comment is third-party text: this code never
 * reads it, it only passes ids.
 */
export function recoveryAgent(gateway: Gateway) {
  /** Reads the labels on a response and opens a case when a person needs to step in. */
  async function review(
    event: { clientId: string; locationId: string | null },
    responseId: string,
    readReason: string,
    openReason: string,
  ) {
    const base = { agentId: RECOVERY, clientId: event.clientId, locationId: event.locationId };
    const classified = await gateway.call({
      ...base,
      tool: "reputation.classify_response",
      input: { responseId, reason: readReason },
    });
    // A refusal is a decision, not a failure: it is in the audit log and nothing retries.
    if (classified.decision !== "executed") return;

    const { severity, shouldOpen } = Classification.parse(classified.output);
    if (!shouldOpen || !severity) return;
    await gateway.call({
      ...base,
      tool: "reputation.open_case",
      input: { responseId, severity, reason: openReason },
    });
  }

  const consumers: ConsumerDefinition[] = [
    defineConsumer({
      name: "host.recovery.read",
      event: "survey.response.submitted",
      options: { isEnabled: featureGate("reputation") },
      handler: (event) =>
        review(
          event,
          event.data.responseId,
          `read the survey response with a rating of ${event.data.rating} of 5`,
          `a rating of ${event.data.rating} of 5 needs a person to follow up`,
        ),
    }) as ConsumerDefinition,
    // The agent read the guest's words: a serious reading can open a case the rating did not.
    // Opening is idempotent per response, so both triggers firing yields one case.
    defineConsumer({
      name: "host.recovery.read_sentiment",
      event: "survey.response.read",
      options: { isEnabled: featureGate("reputation") },
      handler: (event) =>
        review(
          event,
          event.data.responseId,
          `read the labels of a survey response (concern ${event.data.concern})`,
          `the reading of a survey response (concern ${event.data.concern}, safety ${event.data.safety}) needs a person to follow up`,
        ),
    }) as ConsumerDefinition,
  ];
  return { consumers, jobs: [] };
}
