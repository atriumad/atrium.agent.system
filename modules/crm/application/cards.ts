import { createHash } from "node:crypto";
import { type Database, listLocations, locationStatusFor, withTenant } from "@atrium/core";
import { and, count, eq, gt, min, sql } from "drizzle-orm";
import { progress } from "../domain/loyalty";
import { LIMITS } from "../domain/rate";
import {
  formatShortCode,
  generateCardToken,
  generateShortCode,
  hashCardToken,
  looksLikeCardToken,
  verifyJoinToken,
} from "../domain/tokens";
import { listCardEvents } from "../infra/repository";
import { loyaltyCards, loyaltyPrograms } from "../infra/schema";
import { checkRate } from "./rate";
import { type Accent, type CrmDeps, clock, envelope } from "./shared";

export type IssueResult =
  | { ok: true; card: { token: string; shortCode: string }; programId: string }
  | {
      ok: false;
      reason: "invalid" | "paused" | "device_limit" | "rate_limited";
      retryAfter?: number;
    };

const MAX_SHORT_CODE_ATTEMPTS = 5;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Issues an anonymous card from a scanned join QR. There is no session: the program is found
 * through `crm.program_scope`, and nothing in a tenant table is read until the client is known.
 */
export async function issueCard(
  db: Database,
  input: { joinToken: string; deviceHash: string; ip: string },
  deps: CrmDeps,
): Promise<IssueResult> {
  const now = clock(deps);
  if (input.deviceHash.trim() === "") return { ok: false, reason: "invalid" };

  // Every attempt counts against the address first, valid or not, so probing is limited too.
  const byIp = await checkRate(db, `join:ip:${digest(input.ip)}`, "joinPerIp", now);
  if (!byIp.allowed) return { ok: false, reason: "rate_limited", retryAfter: byIp.retryAfter };

  const claim = verifyJoinToken(deps.secret, input.joinToken);
  if (!claim) return { ok: false, reason: "invalid" };

  const rows = await db.execute<{
    client_id: string;
    location_id: string;
    active: boolean;
    join_qr_version: number;
  }>(sql`select * from crm.program_scope(${claim.programId}::uuid)`);
  const program = rows[0];
  if (!program || program.join_qr_version !== claim.version)
    return { ok: false, reason: "invalid" };

  const status = await locationStatusFor(db, program.location_id);
  if (status === null) return { ok: false, reason: "invalid" };
  if (!program.active || status !== "active") return { ok: false, reason: "paused" };

  const byProgram = await checkRate(
    db,
    `card:program:${claim.programId}`,
    "cardsPerProgramPerHour",
    now,
  );
  if (!byProgram.allowed) {
    return { ok: false, reason: "rate_limited", retryAfter: byProgram.retryAfter };
  }

  const token = generateCardToken();
  const tokenHash = hashCardToken(token);
  const makeCode = deps.generateShortCode ?? generateShortCode;

  return withTenant(db, program.client_id, async (tx) => {
    // A device may hold one card per program in any 24 hours. Only cards that exist count, so a
    // failed attempt never uses the allowance up.
    const since = new Date(now.getTime() - LIMITS.cardPerDevicePerDay.windowSeconds * 1000);
    const [recent] = await tx
      .select({ oldest: min(loyaltyCards.createdAt), n: count() })
      .from(loyaltyCards)
      .where(
        and(
          eq(loyaltyCards.programId, claim.programId),
          eq(loyaltyCards.deviceHash, input.deviceHash),
          gt(loyaltyCards.createdAt, since),
        ),
      );
    if (recent && recent.n >= LIMITS.cardPerDevicePerDay.limit) {
      const until =
        (recent.oldest?.getTime() ?? now.getTime()) +
        LIMITS.cardPerDevicePerDay.windowSeconds * 1000;
      return {
        ok: false as const,
        reason: "device_limit" as const,
        retryAfter: Math.max(1, Math.ceil((until - now.getTime()) / 1000)),
      };
    }

    for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt++) {
      const shortCode = makeCode();
      // client and location come from the program, never from the caller
      const [card] = await tx
        .insert(loyaltyCards)
        .values({
          clientId: program.client_id,
          locationId: program.location_id,
          programId: claim.programId,
          tokenHash,
          shortCode,
          deviceHash: input.deviceHash,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [loyaltyCards.locationId, loyaltyCards.shortCode] })
        .returning({ id: loyaltyCards.id });
      if (!card) continue;
      await deps.publish?.(
        {
          ...envelope(program.client_id, program.location_id, now),
          type: "loyalty.card.issued",
          version: 1,
          data: { cardId: card.id, programId: claim.programId },
        },
        tx,
      );
      return {
        ok: true as const,
        card: { token, shortCode: formatShortCode(shortCode) },
        programId: claim.programId,
      };
    }
    throw new Error("could not find a free short code");
  });
}

export type CardView = {
  state: "active" | "paused" | "closed";
  locationName: string;
  programName: string;
  rewardLabel: string;
  accent: Accent;
  stampsRequired: number;
  stampsInCycle: number;
  rewardReady: boolean;
  shortCode: string;
  etag: string;
};

/** What the customer's card page shows. Null for a token that is not a card. No guest data. */
export async function getCardByToken(
  db: Database,
  token: string,
  _deps: CrmDeps,
): Promise<CardView | null> {
  if (!looksLikeCardToken(token)) return null;
  const found = await db.execute<{
    card_id: string;
    client_id: string;
    location_id: string;
    program_id: string;
  }>(sql`select * from crm.card_scope(${hashCardToken(token)})`);
  const scope = found[0];
  if (!scope) return null;

  const status = await locationStatusFor(db, scope.location_id);

  return withTenant(db, scope.client_id, async (tx) => {
    const [card] = await tx.select().from(loyaltyCards).where(eq(loyaltyCards.id, scope.card_id));
    const [program] = await tx
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, scope.program_id));
    if (!card || !program) return null;
    const location = (await listLocations(tx, scope.client_id)).find(
      (l) => l.id === scope.location_id,
    );
    const events = await listCardEvents(tx, card.id);
    const { stampsInCycle, rewardReady } = progress(events, program.stampsRequired);

    const state: CardView["state"] =
      !program.active || status !== "active" ? "paused" : card.closedAt ? "closed" : "active";
    const visible = {
      state,
      locationName: location?.name ?? "",
      programName: program.name,
      rewardLabel: program.rewardLabel,
      accent: program.accent as Accent,
      stampsRequired: program.stampsRequired,
      stampsInCycle,
      rewardReady,
      shortCode: formatShortCode(card.shortCode),
    };
    return { ...visible, etag: digest(JSON.stringify(visible)).slice(0, 32) };
  });
}
