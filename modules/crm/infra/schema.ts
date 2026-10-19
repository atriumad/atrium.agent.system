import {
  bigint,
  boolean,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// The migration also holds the composite keys that keep a child in its parent's client and
// location (cards -> programs, events and rewards -> cards, a void -> an event of its own card),
// the unique keys they target and the checks. Drizzle is only used to read and write here.
const crm = pgSchema("crm");
const at = (name: string) => timestamp(name, { withTimezone: true });

export const loyaltyPrograms = crm.table("loyalty_programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  name: text("name").notNull(),
  stampsRequired: integer("stamps_required").notNull().default(8),
  rewardLabel: text("reward_label").notNull(),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(240),
  active: boolean("active").notNull().default(true),
  joinQrVersion: integer("join_qr_version").notNull().default(1),
  accent: text("accent").notNull().default("lime"),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

export const loyaltyCards = crm.table("loyalty_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  programId: uuid("program_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  shortCode: text("short_code").notNull(),
  guestId: uuid("guest_id"),
  deviceHash: text("device_hash"),
  createdAt: at("created_at").notNull().defaultNow(),
  lastStampAt: at("last_stamp_at"),
  closedAt: at("closed_at"),
});

export const loyaltyEvents = crm.table("loyalty_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  cardId: uuid("card_id").notNull(),
  kind: text("kind").notNull(),
  actorId: text("actor_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  voidsId: uuid("voids_id"),
  note: text("note"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const loyaltyRewards = crm.table("loyalty_rewards", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  cardId: uuid("card_id").notNull(),
  earnedAt: at("earned_at").notNull().defaultNow(),
  redeemedAt: at("redeemed_at"),
  redeemedBy: text("redeemed_by"),
});

export const rateCounters = crm.table(
  "rate_counters",
  {
    key: text("key").notNull(),
    windowStart: at("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
