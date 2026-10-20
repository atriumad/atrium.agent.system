export type LoyaltyAccent = "lime" | "clay" | "charcoal" | "sage";

export const LOYALTY_ACCENTS: readonly LoyaltyAccent[] = ["lime", "clay", "charcoal", "sage"];

/** The closed palette a program can pick from. Whole class names, so Tailwind sees them. */
export const ACCENT_STYLE: Record<LoyaltyAccent, { fill: string; ink: string; label: string }> = {
  lime: { fill: "bg-lime-500", ink: "text-charcoal-900", label: "Lime" },
  clay: { fill: "bg-clay-500", ink: "text-cream-100", label: "Clay" },
  charcoal: { fill: "bg-charcoal-800", ink: "text-cream-100", label: "Charcoal" },
  sage: { fill: "bg-sage-500", ink: "text-cream-100", label: "Sage" },
};
