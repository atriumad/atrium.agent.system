import { z } from "zod";

/**
 * What can travel in a help conversation. Docs: modules / Reputation (Help requests).
 * The shapes are shared by the API and the screens; the server checks everything again.
 */
export const HELP_BODY_MAX = 2000;

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const HelpAttachment = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("response"), responseId: z.string().uuid() }),
  z.strictObject({
    kind: z.literal("review"),
    // Trimmed, checked, then stored as the parsed href so `HTTPS://x` is a plain https link.
    url: z
      .string()
      .trim()
      .max(2048)
      .refine(isHttps, "must be an https link")
      .transform((u) => new URL(u).href),
    rating: z.number().int().min(1).max(5).optional(),
    text: z
      .string()
      .trim()
      .max(1000)
      .transform((t) => t || undefined)
      .optional(),
  }),
]);
export type HelpAttachment = z.infer<typeof HelpAttachment>;

const body = z.string().trim().min(1).max(HELP_BODY_MAX);

export const HelpMessageInput = z.strictObject({
  body,
  attachment: HelpAttachment.nullish(),
});
export type HelpMessageInput = z.infer<typeof HelpMessageInput>;

export const HelpCloseInput = z.strictObject({
  to: z.enum(["fulfilled", "dismissed"]),
  message: z
    .string()
    .trim()
    .max(HELP_BODY_MAX)
    .transform((m) => m || undefined)
    .nullish(),
});
export type HelpCloseInput = z.infer<typeof HelpCloseInput>;

export const HelpRequestInput = z.strictObject({
  locationId: z.string().uuid(),
  note: body,
  attachment: HelpAttachment.nullish(),
});
export type HelpRequestInput = z.infer<typeof HelpRequestInput>;
