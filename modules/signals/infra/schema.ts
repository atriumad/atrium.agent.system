import {
  date,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const signals = pgSchema("signals");

/**
 * The parent table only. Partitions (signals_daily_YYYY_MM) are the owner role's and are never
 * addressed directly. The natural key lives in the migration as a NULLS NOT DISTINCT constraint.
 */
export const signalsDaily = signals.table("signals_daily", {
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  source: text("source").notNull(),
  platform: text("platform"),
  elementId: text("element_id"),
  signalType: text("signal_type").notNull(),
  value: numeric("value", { precision: 20, scale: 4, mode: "number" }).notNull(),
  meta: jsonb("meta"),
  guestId: uuid("guest_id"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  /** 1 on insert, +1 each time a re-run replaces the value. */
  revision: integer("revision").notNull().default(1),
});

export const connectorTokens = signals.table("connector_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  sources: text("sources").array().notNull(),
  clientIds: uuid("client_ids").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});
