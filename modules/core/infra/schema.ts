import { integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
