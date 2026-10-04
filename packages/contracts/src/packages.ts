/** What a client buys, and the features it unlocks. Docs: product / Packages and access. */
export const PACKAGES = ["essential", "pillar_2", "pillar_3"] as const;
export type PackageId = (typeof PACKAGES)[number];

/**
 * Everything access is asked about: the six rows of the access matrix plus the three sections
 * the Platform locks with a teaser.
 */
export const FEATURES = [
  "content",
  "analytics",
  "discoverability",
  "reputation",
  "retention",
  "attribution",
  "growth",
  "management",
  "benchmarks",
] as const;
export type Feature = (typeof FEATURES)[number];

export const ACCESS_LEVELS = ["locked", "basic", "full"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
