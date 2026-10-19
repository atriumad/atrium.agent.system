import {
  can,
  type Database,
  locationStatusFor,
  locationVisible,
  type Scope,
  type Tx,
  writeAudit,
} from "@atrium/core";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { canStamp, type EventRow, lastVoidableStamp, progress } from "../domain/loyalty";
import { hashCardToken, looksLikeCardToken, normalizeShortCode } from "../domain/tokens";
import { listCardEvents } from "../infra/repository";
import { loyaltyCards, loyaltyEvents, loyaltyPrograms, loyaltyRewards } from "../infra/schema";
import {
  CardNotFoundError,
  type CrmDeps,
  clock,
  envelope,
  InvalidStampInputError,
  LoyaltyForbiddenError,
  NoRewardError,
  NothingToVoidError,
  StampRefusedError,
} from "./shared";

export type CardLookup = { locationId: string } & ({ code: string } | { cardToken: string });

/**
 * `stampsInCycle` on the completing stamp equals `stampsRequired` (the card view shows 0 with
 * `rewardReady` once the reward is earned). A replayed key recomputes the result with the
 * program's current `stampsRequired`. Redeeming is allowed on a paused program or a closed card
 * on purpose: an earned reward is honoured.
 */
export type StampResult = {
  cardId: string;
  stampsInCycle: number;
  stampsRequired: number;
  rewardEarned: boolean;
  rewardReady: boolean;
};

const actorOf = (scope: Scope) => ({ type: "user" as const, id: scope.userId });

function require(scope: Scope, action: "stamp" | "redeem" | "manage") {
  if (!can(scope.role, "loyalty", action)) throw new LoyaltyForbiddenError(action);
}

function checkKey(key: unknown): string {
  if (typeof key !== "string" || key.trim() === "" || key.length > 200) {
    throw new InvalidStampInputError("idempotencyKey: 1 to 200 characters");
  }
  // `earned:` keys are written by stampCard itself for the reward_earned event
  if (key.startsWith("earned:"))
    throw new InvalidStampInputError("idempotencyKey: reserved prefix");
  return key;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The time a new event is stamped with. Read after the card lock, and never earlier than the
 * card's latest event or stamp: events are ordered by (created_at, seq), so a clock that runs
 * backwards must not sort a new event before one the lock order already put ahead of it.
 */
function eventTime(deps: CrmDeps, events: EventRow[], card: { lastStampAt: Date | null }): Date {
  const times = [clock(deps).getTime(), card.lastStampAt?.getTime() ?? 0];
  const latest = events.at(-1);
  if (latest) times.push(latest.at.getTime());
  return new Date(Math.max(...times));
}

type Card = typeof loyaltyCards.$inferSelect;

async function findCard(tx: Tx, scope: Scope, lookup: CardLookup): Promise<Card> {
  if (!UUID.test(String(lookup.locationId)) || !locationVisible(scope, lookup.locationId)) {
    throw new CardNotFoundError();
  }
  let match: ReturnType<typeof eq>;
  if ("code" in lookup) {
    const code = typeof lookup.code === "string" ? normalizeShortCode(lookup.code) : null;
    if (!code) throw new CardNotFoundError();
    match = eq(loyaltyCards.shortCode, code);
  } else {
    if (typeof lookup.cardToken !== "string" || !looksLikeCardToken(lookup.cardToken)) {
      throw new CardNotFoundError();
    }
    match = eq(loyaltyCards.tokenHash, hashCardToken(lookup.cardToken));
  }
  // Row-level security hides a card the scope cannot see: the same answer as an unknown one.
  const [card] = await tx
    .select()
    .from(loyaltyCards)
    .where(and(eq(loyaltyCards.locationId, lookup.locationId), match));
  if (!card) throw new CardNotFoundError();
  return card;
}

/**
 * Serializes everything that changes one card for the rest of the transaction, then reads the
 * card again: a waiting caller must see what the one before it committed.
 */
async function lockCard(tx: Tx, cardId: string): Promise<Card> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${cardId}, 0))`);
  const [card] = await tx.select().from(loyaltyCards).where(eq(loyaltyCards.id, cardId));
  if (!card) throw new CardNotFoundError();
  return card;
}

async function previousEvent(tx: Tx, cardId: string, key: string) {
  const [row] = await tx
    .select()
    .from(loyaltyEvents)
    .where(and(eq(loyaltyEvents.cardId, cardId), eq(loyaltyEvents.idempotencyKey, key)));
  return row;
}

const upTo = (events: EventRow[], ...ids: string[]) => {
  const last = Math.max(...ids.map((id) => events.findIndex((e) => e.id === id)));
  return events.slice(0, last + 1);
};

async function programOf(tx: Tx, card: Card) {
  const [program] = await tx
    .select()
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.id, card.programId));
  if (!program) throw new CardNotFoundError();
  return program;
}

/** Adds a stamp to a card found by its short code or its token. Staff only. */
export async function stampCard(
  tx: Tx,
  scope: Scope,
  lookup: CardLookup,
  input: { idempotencyKey: string },
  deps: CrmDeps,
): Promise<StampResult> {
  require(scope, "stamp");
  const key = checkKey(input.idempotencyKey);
  const found = await findCard(tx, scope, lookup);
  const card = await lockCard(tx, found.id);
  const program = await programOf(tx, card);
  const events = await listCardEvents(tx, card.id);
  const now = eventTime(deps, events, card);

  const seen = await previousEvent(tx, card.id, key);
  if (seen) {
    if (seen.kind !== "stamp") throw new InvalidStampInputError("idempotencyKey: already used");
    const earned = await previousEvent(tx, card.id, `earned:${seen.id}`);
    const atStamp = progress(upTo(events, seen.id), program.stampsRequired);
    const after = progress(
      upTo(events, seen.id, ...(earned ? [earned.id] : [])),
      program.stampsRequired,
    );
    return {
      cardId: card.id,
      stampsInCycle: atStamp.stampsInCycle,
      stampsRequired: program.stampsRequired,
      rewardEarned: Boolean(earned),
      rewardReady: after.rewardReady,
    };
  }

  const status = await locationStatusFor(tx as unknown as Database, card.locationId);
  const verdict = canStamp({
    programActive: program.active,
    locationActive: status === "active",
    cardClosed: card.closedAt !== null,
    lastStampAt: card.lastStampAt,
    cooldownMinutes: program.cooldownMinutes,
    now,
  });
  if (!verdict.ok) throw new StampRefusedError(verdict.reason, verdict.retryAt);

  // client and location come from the card, never from the caller
  const [stamp] = await tx
    .insert(loyaltyEvents)
    .values({
      clientId: card.clientId,
      locationId: card.locationId,
      cardId: card.id,
      kind: "stamp",
      actorId: scope.userId,
      idempotencyKey: key,
      createdAt: now,
    })
    .returning({ id: loyaltyEvents.id });
  if (!stamp) throw new Error("stamp was not stored");
  await tx.update(loyaltyCards).set({ lastStampAt: now }).where(eq(loyaltyCards.id, card.id));

  const withStamp = await listCardEvents(tx, card.id);
  const { stampsInCycle } = progress(withStamp, program.stampsRequired);
  const complete = stampsInCycle >= program.stampsRequired;
  let rewardId: string | null = null;
  if (complete) {
    await tx.insert(loyaltyEvents).values({
      clientId: card.clientId,
      locationId: card.locationId,
      cardId: card.id,
      kind: "reward_earned",
      actorId: scope.userId,
      idempotencyKey: `earned:${stamp.id}`,
      createdAt: now,
    });
    const [reward] = await tx
      .insert(loyaltyRewards)
      .values({
        clientId: card.clientId,
        locationId: card.locationId,
        cardId: card.id,
        earnedAt: now,
      })
      .returning({ id: loyaltyRewards.id });
    rewardId = reward?.id ?? null;
  }
  const { rewardReady } = progress(await listCardEvents(tx, card.id), program.stampsRequired);

  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: card.clientId,
    locationId: card.locationId,
    action: "crm.loyalty.stamp",
    input: { cardId: card.id, eventId: stamp.id },
    output: { stampsInCycle, rewardEarned: complete },
    decision: "executed",
  });
  const base = envelope(card.clientId, card.locationId, now);
  await deps.publish?.(
    {
      ...base,
      type: "loyalty.stamp.added",
      version: 1,
      data: { cardId: card.id, stampsInCycle, stampsRequired: program.stampsRequired },
    },
    tx,
  );
  if (complete && rewardId) {
    await deps.publish?.(
      {
        ...envelope(card.clientId, card.locationId, now),
        type: "loyalty.reward.earned",
        version: 1,
        data: { cardId: card.id, rewardId },
      },
      tx,
    );
  }
  return {
    cardId: card.id,
    stampsInCycle,
    stampsRequired: program.stampsRequired,
    rewardEarned: complete,
    rewardReady,
  };
}

/** Redeems the card's oldest unredeemed reward. Staff only. */
export async function redeemReward(
  tx: Tx,
  scope: Scope,
  lookup: CardLookup,
  input: { idempotencyKey: string },
  deps: CrmDeps,
): Promise<{ cardId: string; rewardId: string }> {
  require(scope, "redeem");
  const key = checkKey(input.idempotencyKey);
  const found = await findCard(tx, scope, lookup);
  const card = await lockCard(tx, found.id);

  const seen = await previousEvent(tx, card.id, key);
  if (seen) {
    const rewardId = seen.kind === "reward_redeemed" ? seen.rewardId : null;
    if (!rewardId) throw new InvalidStampInputError("idempotencyKey: already used");
    return { cardId: card.id, rewardId };
  }

  const [pending] = await tx
    .select({ id: loyaltyRewards.id })
    .from(loyaltyRewards)
    .where(and(eq(loyaltyRewards.cardId, card.id), isNull(loyaltyRewards.redeemedAt)))
    .orderBy(asc(loyaltyRewards.earnedAt), asc(loyaltyRewards.id))
    .limit(1);
  if (!pending) throw new NoRewardError();
  const now = eventTime(deps, await listCardEvents(tx, card.id), card);
  // the guard keeps a reward from being redeemed twice even if the lock were ever bypassed
  const [reward] = await tx
    .update(loyaltyRewards)
    .set({ redeemedAt: now, redeemedBy: scope.userId })
    .where(and(eq(loyaltyRewards.id, pending.id), isNull(loyaltyRewards.redeemedAt)))
    .returning({ id: loyaltyRewards.id });
  if (!reward) throw new NoRewardError();

  await tx.insert(loyaltyEvents).values({
    clientId: card.clientId,
    locationId: card.locationId,
    cardId: card.id,
    kind: "reward_redeemed",
    actorId: scope.userId,
    idempotencyKey: key,
    // so a replay of the key can return it
    rewardId: reward.id,
    createdAt: now,
  });
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: card.clientId,
    locationId: card.locationId,
    action: "crm.loyalty.redeem",
    input: { cardId: card.id, rewardId: reward.id },
    decision: "executed",
  });
  await deps.publish?.(
    {
      ...envelope(card.clientId, card.locationId, now),
      type: "loyalty.reward.redeemed",
      version: 1,
      data: { cardId: card.id, rewardId: reward.id },
    },
    tx,
  );
  return { cardId: card.id, rewardId: reward.id };
}

/**
 * Cancels the latest stamp of the current cycle by appending a `void` event; nothing is deleted.
 * A stamp that earned a reward cannot be voided: the reward is paid out and the cycle is closed.
 */
export async function voidLastStamp(
  tx: Tx,
  scope: Scope,
  input: { cardId: string; reason: string; idempotencyKey: string },
  deps: CrmDeps,
): Promise<StampResult> {
  require(scope, "manage");
  const key = checkKey(input.idempotencyKey);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 1 || reason.length > 200) {
    throw new InvalidStampInputError("reason: 1 to 200 characters");
  }
  if (!UUID.test(String(input.cardId))) throw new CardNotFoundError();
  const [visible] = await tx.select().from(loyaltyCards).where(eq(loyaltyCards.id, input.cardId));
  if (!visible || !locationVisible(scope, visible.locationId)) throw new CardNotFoundError();
  const card = await lockCard(tx, visible.id);
  const program = await programOf(tx, card);
  const events = await listCardEvents(tx, card.id);
  const now = eventTime(deps, events, card);

  const result = (list: EventRow[]): StampResult => {
    const p = progress(list, program.stampsRequired);
    return {
      cardId: card.id,
      stampsInCycle: p.stampsInCycle,
      stampsRequired: program.stampsRequired,
      rewardEarned: false,
      rewardReady: p.rewardReady,
    };
  };

  const seen = await previousEvent(tx, card.id, key);
  if (seen) {
    if (seen.kind !== "void") throw new InvalidStampInputError("idempotencyKey: already used");
    return result(upTo(events, seen.id));
  }

  const target = lastVoidableStamp(events);
  if (!target) throw new NothingToVoidError();
  const [voided] = await tx
    .insert(loyaltyEvents)
    .values({
      clientId: card.clientId,
      locationId: card.locationId,
      cardId: card.id,
      kind: "void",
      actorId: scope.userId,
      idempotencyKey: key,
      voidsId: target.id,
      note: reason,
      createdAt: now,
    })
    .returning({ id: loyaltyEvents.id });
  if (!voided) throw new Error("void was not stored");

  // a cancelled stamp no longer holds the cooldown
  const after = await listCardEvents(tx, card.id);
  const cancelled = new Set(after.filter((e) => e.kind === "void").map((e) => e.voidsId));
  const lastStamp = after.filter((e) => e.kind === "stamp" && !cancelled.has(e.id)).at(-1);
  await tx
    .update(loyaltyCards)
    .set({ lastStampAt: lastStamp?.at ?? null })
    .where(eq(loyaltyCards.id, card.id));

  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: card.clientId,
    locationId: card.locationId,
    action: "crm.loyalty.void",
    input: { cardId: card.id, eventId: voided.id, voidedEventId: target.id },
    reason,
    decision: "executed",
  });
  return result(after);
}
