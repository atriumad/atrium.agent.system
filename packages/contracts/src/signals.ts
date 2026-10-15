import { z } from "zod";

/** Source of a signal. Docs: data / Signals and sources. */
export const SIGNAL_SOURCES = [
  "metricool",
  "gbp",
  "landing",
  "site",
  "toast",
  "meta_ads",
  "google_ads",
  "survey",
  "review",
  "manual",
  "agent",
] as const;

export const SIGNAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "google",
  "meta",
] as const;

/** Canonical signal types, grouped by funnel stage. Add a type to the docs before shipping it. */
export const SIGNAL_TYPES_BY_STAGE = {
  awareness: ["impression", "reach_account", "video_view", "follower_add", "discovery_search"],
  consideration: [
    "engagement",
    "save",
    "profile_visit",
    "session",
    "menu_view",
    "link_click",
    "email_open",
    "email_click",
    "direct_search",
  ],
  buying_intent: ["direction", "call", "order_click", "reserve_click", "rsvp", "qr_scan"],
  outcome: [
    "order",
    "reservation",
    "redemption",
    "lead",
    "loyalty_signup",
    "repeat_visit",
    "winback_visit",
    "revenue",
  ],
  health: [
    "review",
    "review_reply",
    "survey_score",
    "rating_point",
    "rank_point",
    "opt_in",
    "opt_out",
    "spend",
    "agent_grade",
  ],
} as const;

export const SIGNAL_TYPES = [
  ...SIGNAL_TYPES_BY_STAGE.awareness,
  ...SIGNAL_TYPES_BY_STAGE.consideration,
  ...SIGNAL_TYPES_BY_STAGE.buying_intent,
  ...SIGNAL_TYPES_BY_STAGE.outcome,
  ...SIGNAL_TYPES_BY_STAGE.health,
] as const;

/** How an attributed dollar was matched. Stored in `meta.method`. */
export const ATTRIBUTION_METHODS = [
  "code",
  "pixel",
  "loyalty",
  "card",
  "estimate",
  "manual",
] as const;

export const SignalSource = z.enum(SIGNAL_SOURCES);
export const SignalPlatform = z.enum(SIGNAL_PLATFORMS);
export const SignalType = z.enum(SIGNAL_TYPES);
export const AttributionMethod = z.enum(ATTRIBUTION_METHODS);

/** The location's local day, `YYYY-MM-DD`, validated as a real calendar date. */
const LocalDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}, "Expected a real date as YYYY-MM-DD");

/** Free-form context (utm, button, zone, method). Small on purpose: it is stored on every row. */
const Meta = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 2048, "meta is limited to 2 KB");

/**
 * One row of `signals_daily`: the atom. Money is integer cents; counts are plain numbers.
 * `clientId` is not part of the row: the ingestion API derives it from the location.
 */
export const SignalRow = z.object({
  date: LocalDate,
  locationId: z.string().uuid(),
  source: SignalSource,
  platform: SignalPlatform.nullable().default(null),
  elementId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,128}$/, "element ids are 1-128 of letters, digits and _ . : -")
    .nullable()
    .default(null),
  signalType: SignalType,
  value: z.number().finite().nonnegative().max(1e12),
  meta: Meta.nullable().default(null),
  /** The stitched identity from Core, so one guest counts once across sources. */
  guestId: z.string().uuid().nullable().default(null),
});
export type SignalRow = z.infer<typeof SignalRow>;
export type SignalRowInput = z.input<typeof SignalRow>;

/**
 * Natural key for idempotent ingestion: a re-run replaces the day.
 * Docs: data / Storage and pipeline.
 */
export function signalNaturalKey(
  row: Pick<SignalRow, "date" | "locationId" | "source" | "platform" | "elementId" | "signalType">,
): string {
  return [
    row.date,
    row.locationId,
    row.source,
    row.platform ?? "",
    row.elementId ?? "",
    row.signalType,
  ].join("|");
}

/** A batch from a connector. One request, one source, one location set. */
export const SignalBatch = z.object({
  rows: z.array(SignalRow).min(1).max(5000),
});
export type SignalBatch = z.infer<typeof SignalBatch>;
