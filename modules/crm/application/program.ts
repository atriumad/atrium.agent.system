import {
  can,
  listLocationLabels,
  locationVisible,
  type Scope,
  type Tx,
  writeAudit,
} from "@atrium/core";
import { and, eq, sql } from "drizzle-orm";
import { ACCENTS } from "../domain/loyalty";
import { signJoinToken } from "../domain/tokens";
import { loyaltyPrograms } from "../infra/schema";
import {
  type Accent,
  type CrmDeps,
  clock,
  InvalidProgramError,
  LoyaltyForbiddenError,
  type Program,
  toProgram,
} from "./shared";

export type ProgramInput = {
  name: string;
  stampsRequired: number;
  rewardLabel: string;
  cooldownMinutes: number;
  active: boolean;
  accent: Accent;
};

const actorOf = (scope: Scope) => ({ type: "user" as const, id: scope.userId });

function require(scope: Scope, action: "read" | "manage") {
  if (!can(scope.role, "loyalty", action)) throw new LoyaltyForbiddenError(action);
}

const inRange = (n: unknown, min: number, max: number) =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

function validate(input: ProgramInput): ProgramInput {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const rewardLabel = typeof input.rewardLabel === "string" ? input.rewardLabel.trim() : "";
  if (name.length < 1 || name.length > 120)
    throw new InvalidProgramError("name: 1 to 120 characters");
  if (rewardLabel.length < 1 || rewardLabel.length > 80)
    throw new InvalidProgramError("rewardLabel: 1 to 80 characters");
  if (!inRange(input.stampsRequired, 2, 20))
    throw new InvalidProgramError("stampsRequired: a whole number from 2 to 20");
  if (!inRange(input.cooldownMinutes, 0, 1440))
    throw new InvalidProgramError("cooldownMinutes: a whole number from 0 to 1440");
  if (typeof input.active !== "boolean") throw new InvalidProgramError("active: true or false");
  if (!ACCENTS.includes(input.accent)) throw new InvalidProgramError("accent: not in the palette");
  return { ...input, name, rewardLabel };
}

/** The location's program, or null when there is none or the scope cannot see the location. */
export async function getProgram(
  tx: Tx,
  scope: Scope,
  locationId: string,
): Promise<Program | null> {
  require(scope, "read");
  if (!locationVisible(scope, locationId)) return null;
  const [row] = await tx
    .select()
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.locationId, locationId));
  return row ? toProgram(row) : null;
}

/** Creates the location's program or updates it: there is one per location. */
export async function upsertProgram(
  tx: Tx,
  scope: Scope,
  locationId: string,
  input: ProgramInput,
  deps: CrmDeps,
): Promise<Program> {
  require(scope, "manage");
  const values = validate(input);
  // Row-level security decides which locations the scope can see; the client id comes from here.
  const location = (await listLocationLabels(tx)).find((l) => l.id === locationId);
  if (!location || !locationVisible(scope, locationId)) {
    throw new InvalidProgramError("unknown location");
  }
  const [row] = await tx
    .insert(loyaltyPrograms)
    .values({ clientId: location.clientId, locationId, ...values, updatedAt: clock(deps) })
    .onConflictDoUpdate({
      target: loyaltyPrograms.locationId,
      set: { ...values, updatedAt: clock(deps) },
    })
    .returning();
  if (!row) throw new Error("program was not stored");
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: row.clientId,
    locationId,
    action: "crm.loyalty.upsert_program",
    input: {
      programId: row.id,
      stampsRequired: row.stampsRequired,
      cooldownMinutes: row.cooldownMinutes,
      active: row.active,
      accent: row.accent,
    },
    decision: "executed",
  });
  return toProgram(row);
}

/** Invalidates every printed join QR of the program. */
export async function rotateJoinQr(tx: Tx, scope: Scope, programId: string): Promise<Program> {
  require(scope, "manage");
  const [row] = await tx
    .update(loyaltyPrograms)
    .set({ joinQrVersion: sql`${loyaltyPrograms.joinQrVersion} + 1`, updatedAt: new Date() })
    .where(and(eq(loyaltyPrograms.id, programId)))
    .returning();
  if (!row || !locationVisible(scope, row.locationId)) {
    throw new InvalidProgramError("unknown program");
  }
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: row.clientId,
    locationId: row.locationId,
    action: "crm.loyalty.rotate_join_qr",
    output: { programId: row.id, joinQrVersion: row.joinQrVersion },
    decision: "executed",
  });
  return toProgram(row);
}

/** The signed token to print in the join QR. */
export function joinToken(program: Program, secret: string): string {
  return signJoinToken(secret, program.id, program.joinQrVersion);
}
