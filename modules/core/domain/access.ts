import { type AccessLevel, FEATURES, type Feature, type PackageId } from "@atrium/contracts";

/**
 * The access matrix, computed once in Core and read by every surface and the MCP gateway.
 * Docs: product / Packages and access.
 *
 * The first six features are the docs' access matrix. `growth`, `management` and `benchmarks`
 * are not in that matrix; their levels come from the teaser table ("unlocks with Pillar 2 / 2 / 3")
 * and should be confirmed (open decision on package tiers).
 */
export const ACCESS_MATRIX: Record<PackageId, Record<Feature, AccessLevel>> = {
  essential: {
    content: "full",
    analytics: "full",
    discoverability: "basic",
    reputation: "locked",
    retention: "locked",
    attribution: "locked",
    growth: "locked",
    management: "locked",
    benchmarks: "locked",
  },
  pillar_2: {
    content: "full",
    analytics: "full",
    discoverability: "full",
    reputation: "full",
    retention: "locked",
    attribution: "basic",
    growth: "full",
    management: "full",
    benchmarks: "locked",
  },
  pillar_3: {
    content: "full",
    analytics: "full",
    discoverability: "full",
    reputation: "full",
    retention: "full",
    attribution: "full",
    growth: "full",
    management: "full",
    benchmarks: "full",
  },
};

export type Overrides = {
  /** Applies to the whole client. The Manager's "Manage access". */
  client?: Partial<Record<Feature, AccessLevel>>;
  /** Applies to one location and wins over the client override. */
  location?: Partial<Record<Feature, AccessLevel>>;
};

/** Most specific wins: location override, then client override, then the package. */
export function resolveLevel(
  pkg: PackageId | null,
  feature: Feature,
  overrides: Overrides = {},
): AccessLevel {
  const level =
    overrides.location?.[feature] ??
    overrides.client?.[feature] ??
    (pkg ? ACCESS_MATRIX[pkg][feature] : undefined);
  return level ?? "locked";
}

export function resolveAccess(
  pkg: PackageId | null,
  overrides: Overrides = {},
): Record<Feature, AccessLevel> {
  return Object.fromEntries(
    FEATURES.map((feature) => [feature, resolveLevel(pkg, feature, overrides)]),
  ) as Record<Feature, AccessLevel>;
}

/** A module is live unless it is locked. A basic module is live with reduced scope. */
export function isLive(level: AccessLevel): boolean {
  return level !== "locked";
}

/**
 * SMS needs the Retention feature and an approved carrier registration (10DLC), whatever the
 * package. Email does not wait for it.
 */
export function canSendSms(retention: AccessLevel, smsRegistered: boolean): boolean {
  return isLive(retention) && smsRegistered;
}
