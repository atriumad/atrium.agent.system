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
  location: ["read", "manage"],
  task: ["read", "fire", "work"],
  content: ["read", "approve"],
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
  },
  account_manager: {
    portfolio: ["read"],
    client: ["read", "update"],
    location: ["read", "manage"],
    task: ["read", "fire", "work"],
    content: ["read", "approve"],
  },
  agency_staff: {
    portfolio: ["read"],
    client: ["read"],
    location: ["read"],
    task: ["read", "work"],
    content: ["read"],
  },
  client_owner: {
    client: ["read"],
    location: ["read"],
    content: ["read", "approve"],
  },
  client_staff: {
    client: ["read"],
    location: ["read"],
    content: ["read"],
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

/** What a request may touch in the database. Maps to withAgency / withTenant. */
export type Scope =
  | { kind: "agency"; userId: string; role: Role }
  | { kind: "client"; userId: string; role: Role; clientId: string };

/** Agency roles live in the agency organization; client roles in a client's organization. */
export function roleAllowedInOrganization(role: Role, isAgencyOrganization: boolean): boolean {
  return isAgencyOrganization ? isAgencyRole(role) : !isAgencyRole(role);
}
