import { eq } from "drizzle-orm";
import { organizations } from "../infra/auth-schema";
import type { Tx } from "../infra/db";
import { clients } from "../infra/schema";

/** The agency organization. Created once; its slug is configuration. */
export async function createAgencyOrganization(tx: Tx, input: { name: string; slug: string }) {
  const [row] = await tx
    .insert(organizations)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  if (!row) throw new Error("agency organization was not created");
  return row;
}

/** A client and the organization that holds its users, linked. Run inside withAgency. */
export async function createClientWithOrganization(tx: Tx, input: { name: string; slug: string }) {
  const [org] = await tx
    .insert(organizations)
    .values({ id: crypto.randomUUID(), name: input.name, slug: input.slug })
    .returning();
  if (!org) throw new Error("client organization was not created");
  const [client] = await tx
    .insert(clients)
    .values({ ...input, organizationId: org.id })
    .returning();
  if (!client) throw new Error("client was not created");
  return { client, organization: org };
}

export async function findOrganizationBySlug(tx: Tx, slug: string) {
  const [row] = await tx.select().from(organizations).where(eq(organizations.slug, slug));
  return row ?? null;
}
