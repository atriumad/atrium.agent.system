import { z } from "zod";

/**
 * The post-visit survey, template v1. Docs: modules / Reputation (Questions).
 * The template is versioned: changing a question never breaks earlier responses.
 */
export const SURVEY_TEMPLATE_VERSION = 1;

export const BEST_PART_OPTIONS = [
  "food",
  "service",
  "atmosphere",
  "value",
  "speed",
  "drinks",
] as const;
export const IMPROVE_OPTIONS = [
  "food",
  "service",
  "atmosphere",
  "value",
  "speed",
  "cleanliness",
  "nothing",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value === "" ? null : value));

/**
 * What a guest submits. Contact details only count when the guest asked to be contacted: the
 * survey asks for a phone or email at that moment and not before.
 */
export const SurveySubmission = z.object({
  rating: z.number().int().min(1).max(5),
  bestPart: z.enum(BEST_PART_OPTIONS).nullable().default(null),
  improve: z.enum(IMPROVE_OPTIONS).nullable().default(null),
  comment: optionalText(1000),
  wantsContact: z.boolean().default(false),
  contactEmail: optionalText(254),
  contactPhone: optionalText(40),
  contactName: optionalText(100),
});
export type SurveySubmission = z.infer<typeof SurveySubmission>;
