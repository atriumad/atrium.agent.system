import type { Tx } from "@atrium/core";
import { defineTool, type Tool } from "@atrium/policy";
import { z } from "zod";
import { getLoyaltyCard, type LoyaltyCardProgress } from "../application/activity";

/**
 * The tools an agent reads the stamp card through. Read-only, ids and codes in, a short typed
 * result out. A place outside the task's scope is a card that is not found.
 */
export function crmTools(): Tool<never, unknown, Tx>[] {
  const getCard = defineTool<{ locationId: string; shortCode: string }, LoyaltyCardProgress, Tx>({
    name: "crm.get_loyalty_card",
    description:
      "Reads the progress of one loyalty card by its short code and place: stamps in the cycle, the reward and what is waiting to be redeemed. Never names the guest.",
    input: z.object({ locationId: z.string().uuid(), shortCode: z.string().min(1).max(20) }),
    output: z.object({
      shortCode: z.string(),
      locationId: z.string().uuid(),
      locationName: z.string(),
      programName: z.string(),
      rewardLabel: z.string(),
      state: z.enum(["active", "paused", "closed"]),
      stampsRequired: z.number().int(),
      stampsInCycle: z.number().int(),
      rewardReady: z.boolean(),
      rewardsPending: z.number().int(),
    }),
    writes: false,
    feature: "retention",
    scopes: ["loyalty:read"],
    never: [
      {
        rule: "return a guest, an email or a phone",
        enforcedBy:
          "getLoyaltyCard reads cards, programs and rewards only (email-activity.test: the tool output holds no guest)",
      },
    ],
    handler: async (input, context, tx) => getLoyaltyCard(tx, input, context.locationId),
  });
  return [getCard] as unknown as Tool<never, unknown, Tx>[];
}
