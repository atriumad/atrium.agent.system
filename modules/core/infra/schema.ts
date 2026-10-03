import { bigint, boolean, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const core = pgSchema("core");

export const clients = core.table("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** The Better Auth organization that holds this client's users. Set by linkClientOrganization. */
  organizationId: text("organization_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locations = core.table("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  timeZone: text("time_zone").notNull(),
  radiusMiles: integer("radius_miles").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guests = core.table("guests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name"),
  erasedAt: timestamp("erased_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guestIdentifiers = core.table("guest_identifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  guestId: uuid("guest_id")
    .notNull()
    .references(() => guests.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consents = core.table("consents", {
  seq: bigint("seq", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  guestId: uuid("guest_id")
    .notNull()
    .references(() => guests.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  purpose: text("purpose").notNull(),
  granted: boolean("granted").notNull(),
  source: text("source").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
