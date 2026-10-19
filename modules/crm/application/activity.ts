import { can, listLocationLabels, locationVisible, type Scope, type Tx } from "@atrium/core";
import { type AnyColumn, and, asc, count, desc, eq, gt, lte, type SQL, sql } from "drizzle-orm";
import { progress } from "../domain/loyalty";
import {
  compareCounts,
  SUMMARY_DAYS,
  type SummaryRange,
  summaryWindows,
  type Tile,
} from "../domain/summary";
import { formatShortCode, normalizeShortCode } from "../domain/tokens";
import { listCardEvents } from "../infra/repository";
import { loyaltyCards, loyaltyEvents, loyaltyPrograms, loyaltyRewards } from "../infra/schema";
import { CardNotFoundError, LoyaltyForbiddenError } from "./shared";

export type ActivityKind = "stamp" | "reward_earned" | "reward_redeemed" | "void";

export type ActivityRow = {
  id: string;
  at: string;
  kind: string;
  cardShortCode: string;
  locationId: string;
  locationName: string;
  actorName: string | null;
  /** The reason of a void. Null for every other kind. */
  note: string | null;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const KINDS: readonly string[] = ["stamp", "reward_earned", "reward_redeemed", "void"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireRead(scope: Scope) {
  if (!can(scope.role, "loyalty", "read")) throw new LoyaltyForbiddenError("read");
}

/** Row-level security decides which events are visible; a named place is only a narrowing. */
function placeFilter(scope: Scope, locationId: string | undefined): SQL | null | "none" {
  if (locationId === undefined) return null;
  if (!UUID.test(locationId) || !locationVisible(scope, locationId)) return "none";
  return eq(loyaltyEvents.locationId, locationId);
}

/** The recent activity of the stamp card: one row per event, never a token or a guest. */
export async function listActivity(
  tx: Tx,
  scope: Scope,
  input: {
    range: SummaryRange;
    locationId?: string;
    kind?: ActivityKind;
    page: number;
    pageSize: number;
    sort: "date";
    dir: "asc" | "desc";
    now: Date;
  },
): Promise<{ rows: ActivityRow[]; total: number; page: number; pageSize: number }> {
  requireRead(scope);
  const pageSize =
    Number.isFinite(input.pageSize) && input.pageSize >= 1
      ? Math.min(Math.floor(input.pageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(input.page) && input.page >= 1 ? Math.floor(input.page) : 1;
  const empty = { rows: [], total: 0, page, pageSize };

  const place = placeFilter(scope, input.locationId);
  if (place === "none") return empty;
  if (input.kind !== undefined && !KINDS.includes(input.kind)) return empty;
  const from = new Date(input.now.getTime() - SUMMARY_DAYS[input.range] * 86_400_000);
  const where = and(
    gt(loyaltyEvents.createdAt, from),
    lte(loyaltyEvents.createdAt, input.now),
    ...(place ? [place] : []),
    ...(input.kind ? [eq(loyaltyEvents.kind, input.kind)] : []),
  );

  const [total] = await tx.select({ n: count() }).from(loyaltyEvents).where(where);
  const order = input.dir === "desc" ? desc : asc;
  const events = await tx
    .select({
      id: loyaltyEvents.id,
      kind: loyaltyEvents.kind,
      at: loyaltyEvents.createdAt,
      locationId: loyaltyEvents.locationId,
      actorId: loyaltyEvents.actorId,
      note: loyaltyEvents.note,
      shortCode: loyaltyCards.shortCode,
    })
    .from(loyaltyEvents)
    .innerJoin(loyaltyCards, eq(loyaltyCards.id, loyaltyEvents.cardId))
    .where(where)
    .orderBy(order(loyaltyEvents.createdAt), order(loyaltyEvents.seq))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const places = new Map((await listLocationLabels(tx)).map((l) => [l.id, l.locationName]));
  const actorIds = [...new Set(events.flatMap((e) => (e.actorId ? [e.actorId] : [])))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    // only the display name of a person who acted on these events, and nothing else of the user
    const users = await tx.execute<{ id: string; name: string | null }>(
      sql`select id, name from core.users where id in (${sql.join(
        actorIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    for (const u of users) if (u.name) names.set(u.id, u.name);
  }

  return {
    rows: events.map((e) => ({
      id: e.id,
      at: e.at.toISOString(),
      kind: e.kind,
      cardShortCode: formatShortCode(e.shortCode),
      locationId: e.locationId,
      locationName: places.get(e.locationId) ?? "",
      actorName: e.actorId ? (names.get(e.actorId) ?? null) : null,
      note: e.kind === "void" ? e.note : null,
    })),
    total: total?.n ?? 0,
    page,
    pageSize,
  };
}

export type LoyaltySummary = {
  cardsIssued: Tile;
  activeCards: Tile;
  stamps: Tile;
  rewardsEarned: Tile;
  rewardsRedeemed: Tile;
};

/** The figures of the loyalty band: this window of N days against the N days before it. */
export async function loyaltySummary(
  tx: Tx,
  scope: Scope,
  input: { range: SummaryRange; locationId?: string; now: Date },
): Promise<LoyaltySummary> {
  requireRead(scope);
  const windows = summaryWindows(input.now, SUMMARY_DAYS[input.range]);
  const zero = compareCounts(0, 0);
  const none: LoyaltySummary = {
    cardsIssued: zero,
    activeCards: zero,
    stamps: zero,
    rewardsEarned: zero,
    rewardsRedeemed: zero,
  };
  const place = placeFilter(scope, input.locationId);
  if (place === "none") return none;

  const within = (column: AnyColumn, w: { from: Date; to: Date }) =>
    and(gt(column, w.from), lte(column, w.to));

  const cardCount = async (w: { from: Date; to: Date }) => {
    const [row] = await tx
      .select({ n: count() })
      .from(loyaltyCards)
      .where(
        and(
          within(loyaltyCards.createdAt, w),
          ...(input.locationId ? [eq(loyaltyCards.locationId, input.locationId)] : []),
        ),
      );
    return row?.n ?? 0;
  };

  const eventCounts = async (w: { from: Date; to: Date }) => {
    const rows = await tx
      .select({
        kind: loyaltyEvents.kind,
        n: count(),
        cards: sql<number>`count(distinct ${loyaltyEvents.cardId})`.mapWith(Number),
      })
      .from(loyaltyEvents)
      .where(and(within(loyaltyEvents.createdAt, w), ...(place ? [place] : [])))
      .groupBy(loyaltyEvents.kind);
    const by = new Map(rows.map((r) => [r.kind, r]));
    // a stamp that was voided no longer counts, wherever the void itself falls
    const [voided] = await tx
      .select({ n: count() })
      .from(loyaltyEvents)
      .where(
        and(
          eq(loyaltyEvents.kind, "stamp"),
          within(loyaltyEvents.createdAt, w),
          ...(place ? [place] : []),
          sql`exists (select 1 from crm.loyalty_events v where v.voids_id = ${loyaltyEvents.id})`,
        ),
      );
    const [active] = await tx
      .select({ n: sql<number>`count(distinct ${loyaltyEvents.cardId})`.mapWith(Number) })
      .from(loyaltyEvents)
      .where(
        and(
          eq(loyaltyEvents.kind, "stamp"),
          within(loyaltyEvents.createdAt, w),
          ...(place ? [place] : []),
          sql`not exists (select 1 from crm.loyalty_events v where v.voids_id = ${loyaltyEvents.id})`,
        ),
      );
    return {
      stamps: (by.get("stamp")?.n ?? 0) - (voided?.n ?? 0),
      active: active?.n ?? 0,
      earned: by.get("reward_earned")?.n ?? 0,
      redeemed: by.get("reward_redeemed")?.n ?? 0,
    };
  };

  const [cardsNow, cardsBefore, now, before] = [
    await cardCount(windows.current),
    await cardCount(windows.previous),
    await eventCounts(windows.current),
    await eventCounts(windows.previous),
  ];
  return {
    cardsIssued: compareCounts(cardsNow, cardsBefore),
    activeCards: compareCounts(now.active, before.active),
    stamps: compareCounts(now.stamps, before.stamps),
    rewardsEarned: compareCounts(now.earned, before.earned),
    rewardsRedeemed: compareCounts(now.redeemed, before.redeemed),
  };
}

export type LoyaltyCardProgress = {
  shortCode: string;
  locationId: string;
  locationName: string;
  programName: string;
  rewardLabel: string;
  state: "active" | "closed";
  stampsRequired: number;
  stampsInCycle: number;
  rewardReady: boolean;
  rewardsPending: number;
};

/**
 * A card's progress by short code and place, for the agent tool. Reads through the caller's
 * transaction, so a place outside its scope is a card that is not found. No guest is read.
 */
export async function getLoyaltyCard(
  tx: Tx,
  input: { locationId: string; shortCode: string },
  pinnedLocationId: string | null,
): Promise<LoyaltyCardProgress> {
  const code = typeof input.shortCode === "string" ? normalizeShortCode(input.shortCode) : null;
  if (
    !code ||
    !UUID.test(String(input.locationId)) ||
    (pinnedLocationId !== null && pinnedLocationId !== input.locationId)
  ) {
    throw new CardNotFoundError();
  }
  const [card] = await tx
    .select()
    .from(loyaltyCards)
    .where(and(eq(loyaltyCards.locationId, input.locationId), eq(loyaltyCards.shortCode, code)));
  if (!card) throw new CardNotFoundError();
  const [program] = await tx
    .select()
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.id, card.programId));
  if (!program) throw new CardNotFoundError();
  const { stampsInCycle, rewardReady } = progress(
    await listCardEvents(tx, card.id),
    program.stampsRequired,
  );
  const [pending] = await tx
    .select({ n: count() })
    .from(loyaltyRewards)
    .where(and(eq(loyaltyRewards.cardId, card.id), sql`${loyaltyRewards.redeemedAt} is null`));
  const place = (await listLocationLabels(tx)).find((l) => l.id === card.locationId);
  return {
    shortCode: formatShortCode(card.shortCode),
    locationId: card.locationId,
    locationName: place?.locationName ?? "",
    programName: program.name,
    rewardLabel: program.rewardLabel,
    state: card.closedAt ? "closed" : "active",
    stampsRequired: program.stampsRequired,
    stampsInCycle,
    rewardReady,
    rewardsPending: pending?.n ?? 0,
  };
}
