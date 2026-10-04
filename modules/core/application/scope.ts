import { and, eq, sql } from "drizzle-orm";
import {
  isAgencyRole,
  isAssignedRole,
  isLocationScopedRole,
  isRole,
  type Scope,
} from "../domain/roles";
import { members, organizations } from "../infra/auth-schema";
import type { Database } from "../infra/db";

export type SessionIdentity = { userId: string; activeOrganizationId: string | null | undefined };

/**
 * Turns a session into what the request may touch. The role is read from the database membership,
 * never from the client. Returns null when the user is not a member of the active organization.
 */
export async function resolveScope(
  db: Database,
  identity: SessionIdentity,
  agencySlug: string,
): Promise<Scope | null> {
  if (!identity.activeOrganizationId) return null;

  const [row] = await db
    .select({ role: members.role, slug: organizations.slug })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(
      and(
        eq(members.userId, identity.userId),
        eq(members.organizationId, identity.activeOrganizationId),
      ),
    );
  if (!row || !isRole(row.role)) return null;

  const isAgencyOrg = row.slug === agencySlug;
  if (isAgencyOrg) {
    if (!isAgencyRole(row.role)) return null;
    // Admins see the portfolio; managers and staff only the clients assigned to them.
    return isAssignedRole(row.role)
      ? { kind: "assigned", userId: identity.userId, role: row.role }
      : { kind: "agency", userId: identity.userId, role: row.role };
  }
  if (isAgencyRole(row.role)) return null;

  const result = await db.execute<{ id: string | null }>(
    sql`select core.client_id_for_org(${identity.activeOrganizationId}) as id`,
  );
  const clientId = result[0]?.id;
  if (!clientId) return null;
  if (isLocationScopedRole(row.role)) {
    const locationIds = await db.execute<{ ids: string[] | string | null }>(
      sql`select core.location_ids_for_user(${identity.userId}, ${clientId}::uuid) as ids`,
    );
    return {
      kind: "client",
      userId: identity.userId,
      role: row.role,
      clientId,
      locationIds: parseUuidArray(locationIds[0]?.ids),
    };
  }
  return { kind: "client", userId: identity.userId, role: row.role, clientId };
}

/** The driver may hand a uuid[] back as an array or as its Postgres text form. */
function parseUuidArray(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.replace(/[{}]/g, "").split(",").filter(Boolean);
}
