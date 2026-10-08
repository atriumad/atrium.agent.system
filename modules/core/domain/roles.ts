/**
 * Roles and the permission matrix. Docs: architecture / Security and isolation.
 * Permission roles say what a person may do; team roles say what they do (tasks they see and own).
 * Pure data: no framework. The auth layer builds its access control from this.
 */
export const AGENCY_ROLES = ["agency_admin", "account_manager", "agency_staff"] as const;
export const CLIENT_ROLES = ["client_owner", "client_staff"] as const;
export const ROLES = [...AGENCY_ROLES, ...CLIENT_ROLES] as const;
export type Role = (typeof ROLES)[number];

export const TEAM_ROLES = [
  "account_manager",
  "assistant_account_manager",
  "creative_director",
  "assistant_creative_director",
  "developer",
  "graphic_designer",
  "video_editor",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const PERMISSIONS = {
  portfolio: ["read", "manage"],
  client: ["read", "update"],
  location: ["read", "manage", "request"],
  task: ["read", "fire", "work"],
  content: ["read", "approve"],
  // Surveys. read: responses and cases. forms: locations, QR, printable card. operate: one-off
  // links and the send delay. manage: the Google review link and rotating the QR. request: ask
  // the agency for help.
  survey: ["read", "forms", "operate", "manage", "request"],
} as const;
export type Resource = keyof typeof PERMISSIONS;
export type Action<R extends Resource> = (typeof PERMISSIONS)[R][number];

type Grants = { [R in Resource]?: readonly Action<R>[] };

export const PERMISSION_MATRIX: Record<Role, Grants> = {
  agency_admin: {
    portfolio: ["read", "manage"],
    client: ["read", "update"],
    location: ["read", "manage"],
    task: ["read", "fire", "work"],
    content: ["read", "approve"],
    survey: ["read", "forms", "operate", "manage"],
  },
  account_manager: {
    portfolio: ["read"],
    client: ["read", "update"],
    location: ["read", "manage"],
    task: ["read", "fire", "work"],
    content: ["read", "approve"],
    survey: ["read", "forms", "operate", "manage"],
  },
  agency_staff: {
    portfolio: ["read"],
    client: ["read"],
    location: ["read"],
    task: ["read", "work"],
    content: ["read"],
    survey: ["read", "forms"],
  },
  client_owner: {
    client: ["read"],
    location: ["read", "request"],
    content: ["read", "approve"],
    survey: ["read", "forms", "operate", "request"],
  },
  client_staff: {
    client: ["read"],
    location: ["read"],
    content: ["read"],
    survey: ["read"],
  },
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isAgencyRole(role: Role): boolean {
  return (AGENCY_ROLES as readonly string[]).includes(role);
}

export function can<R extends Resource>(role: Role, resource: R, action: Action<R>): boolean {
  const granted = PERMISSION_MATRIX[role][resource] as readonly string[] | undefined;
  return granted?.includes(action) ?? false;
}

/**
 * What a request may touch in the database. Maps to withAgency / withAssigned / withTenant,
 * or to `withScope`, which picks for you.
 *
 * - `agency`: the whole portfolio (agency admins).
 * - `assigned`: only the clients assigned to this user (account managers, agency staff).
 * - `client`: one client. `locationIds` narrows it to assigned locations (client staff);
 *   absent means every location (the owner).
 */
export type Scope =
  | { kind: "agency"; userId: string; role: Role }
  | { kind: "assigned"; userId: string; role: Role }
  | { kind: "client"; userId: string; role: Role; clientId: string; locationIds?: string[] };

/** Roles that see only the clients assigned to them. */
export function isAssignedRole(role: Role): boolean {
  return role === "account_manager" || role === "agency_staff";
}

/** Roles whose view is narrowed to assigned locations. */
export function isLocationScopedRole(role: Role): boolean {
  return role === "client_staff";
}

/** Whether a scope may see a location. Downstream modules apply this to their own location_id. */
export function locationVisible(scope: Scope, locationId: string): boolean {
  return scope.kind !== "client" || !scope.locationIds || scope.locationIds.includes(locationId);
}

/** Agency roles live in the agency organization; client roles in a client's organization. */
export function roleAllowedInOrganization(role: Role, isAgencyOrganization: boolean): boolean {
  return isAgencyOrganization ? isAgencyRole(role) : !isAgencyRole(role);
}
