import { type ConsumerDefinition, defineConsumer, featureGate } from "@atrium/core";
import type { Gateway } from "@atrium/policy";

export const SENTIMENT = "host.sentiment";

/**
 * Sentiment. Docs: agents / Host. Triggered by a survey response; asks for the guest's words to
 * be read and labelled. It passes only ids: the text never leaves the tool. A refusal (a kill
 * switch, a daily limit) is a decision and nothing retries; a provider failure throws, so the
 * queue retries it, and meanwhile Recovery already works from the rating.
 */
export function sentimentAgent(gateway: Gateway) {
  const consumers: ConsumerDefinition[] = [
    defineConsumer({
      name: "host.sentiment.read",
      event: "survey.response.submitted",
      options: { isEnabled: featureGate("reputation") },
      handler: async (event) => {
        await gateway.call({
          agentId: SENTIMENT,
          clientId: event.clientId,
          locationId: event.locationId,
          tool: "reputation.read_response",
          input: {
            responseId: event.data.responseId,
            reason: `read the words of a survey response with a rating of ${event.data.rating} of 5`,
          },
        });
      },
    }) as ConsumerDefinition,
  ];
  return { consumers, jobs: [] };
}
