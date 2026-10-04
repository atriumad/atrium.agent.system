import { createHash, randomBytes } from "node:crypto";
import { SIGNAL_SOURCES } from "@atrium/contracts";
import { type Actor, type Database, type Tx, writeAudit } from "@atrium/core";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Principal } from "../domain/ingestion";
import { connectorTokens } from "../infra/schema";

const PREFIX = "atg_";

export function generateToken(): string {
  return `${PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** Only this hash is ever stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a token for one connector. The plaintext is returned once and cannot be recovered.
 * Needs agency scope (RLS). Sources and clients are fixed at creation: widening a connector
 * means issuing a new token.
 */
export async function createConnectorToken(
  tx: Tx,
  input: { name: string; sources: string[]; clientIds: string[] },
  actor: Actor,
): Promise<{ id: string; token: string }> {
  const sources = [...new Set(input.sources)];
  const clientIds = [...new Set(input.clientIds)];
  if (sources.length === 0) throw new Error("a token needs at least one source");
  if (clientIds.length === 0) throw new Error("a token needs at least one client");
  const unknown = sources.filter((s) => !(SIGNAL_SOURCES as readonly string[]).includes(s));
  if (unknown.length > 0) throw new Error(`unknown source: ${unknown.join(", ")}`);

  const token = generateToken();
  const [row] = await tx
    .insert(connectorTokens)
    .values({
      name: input.name,
      tokenHash: hashToken(token),
      sources,
      clientIds,
      createdBy: actor.id,
    })
    .returning({ id: connectorTokens.id });
  if (!row) throw new Error("token was not created");

  await writeAudit(tx, {
    actor,
    clientId: null,
    action: "signals.create_connector_token",
    input: { name: input.name, sources, clientCount: clientIds.length },
    output: { tokenId: row.id },
    decision: "executed",
  });
  return { id: row.id, token };
}

export async function revokeConnectorToken(tx: Tx, id: string, actor: Actor): Promise<boolean> {
  const revoked = await tx
    .update(connectorTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(connectorTokens.id, id), isNull(connectorTokens.revokedAt)))
    .returning({ id: connectorTokens.id });
  if (revoked.length === 0) return false;
  await writeAudit(tx, {
    actor,
    clientId: null,
    action: "signals.revoke_connector_token",
    input: { tokenId: id },
    decision: "executed",
  });
  return true;
}

/**
 * Finds the connector behind a bearer token, or null when it is unknown or revoked. Runs before
 * any scope exists, so it goes through a narrow database function that also stamps last use.
 */
export async function authenticateToken(db: Database, token: string): Promise<Principal | null> {
  if (!token.startsWith(PREFIX) || token.length > 200) return null;
  const rows = await db.execute<{
    id: string;
    name: string;
    sources: string[] | string;
    client_ids: string[] | string;
  }>(sql`select * from signals.authenticate_token(${hashToken(token)})`);
  const row = rows[0];
  if (!row) return null;
  return {
    tokenId: row.id,
    name: row.name,
    sources: parsePgArray(row.sources),
    clientIds: parsePgArray(row.client_ids),
  };
}

/** The driver may return an array column as an array or as its Postgres text form. */
function parsePgArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  return value.replace(/[{}"]/g, "").split(",").filter(Boolean);
}
