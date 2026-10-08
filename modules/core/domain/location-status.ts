export const LOCATION_STATUSES = ["pending", "active", "suspended", "rejected"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

const MOVES: Record<LocationStatus, readonly LocationStatus[]> = {
  pending: ["active", "rejected"],
  active: ["suspended"],
  suspended: ["active"],
  rejected: [],
};

export function canTransitionLocation(from: LocationStatus, to: LocationStatus): boolean {
  return MOVES[from].includes(to);
}
