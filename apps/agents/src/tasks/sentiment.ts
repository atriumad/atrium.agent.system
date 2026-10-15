import { defineTask, refusal } from "./task";

export const SENTIMENT = "host.sentiment";

/**
 * Sentiment. Docs: agents / Host. Triggered by a survey response; asks for the guest's words to be
 * read and labelled. It passes only ids: the text never leaves the tool. Without a model there is
 * nothing to ask, so it says so and nothing retries; Recovery already works from the rating.
 */
export const sentimentRead = defineTask({
  name: "sentiment.read",
  run: async (ctx, { clientId, locationId, input }) => {
    if (!ctx.models.sentiment) {
      return { decision: "rejected", reason: "no model is configured for sentiment" };
    }
    const result = await ctx.gateway.call({
      agentId: SENTIMENT,
      clientId,
      locationId,
      tool: "reputation.read_response",
      input: {
        responseId: input.responseId,
        reason: `read the words of a survey response with a rating of ${input.rating} of 5`,
      },
    });
    if (result.decision !== "executed") return refusal(result);
    const { status } = result.output as { status: "read" | "already_read" | "no_text" };
    return { decision: "executed", result: { status } };
  },
});
