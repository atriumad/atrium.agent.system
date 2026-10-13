// packages/contracts/src/sentiment.ts
import { z } from "zod";

/**
 * What the agent reads in a guest's words. Docs: modules / Reputation (Sentiment). The schema is
 * closed on purpose: a hostile comment can only move a label inside these values, and a label
 * can only raise a severity, never lower one.
 */
export const SENTIMENTS = ["positive", "mixed", "negative"] as const;
export const TOPICS = [
  "food",
  "service",
  "wait",
  "cleanliness",
  "price",
  "atmosphere",
  "staff",
  "other",
] as const;
export const CONCERNS = ["none", "low", "medium", "high"] as const;

export const Reading = z.strictObject({
  sentiment: z.enum(SENTIMENTS),
  topics: z.array(z.enum(TOPICS)).max(3),
  concern: z.enum(CONCERNS),
  /** Health, allergy, injury or serious mistreatment. */
  safety: z.boolean(),
});
export type Reading = z.infer<typeof Reading>;
