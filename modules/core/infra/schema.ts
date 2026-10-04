import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

export const clientPackages = core.table("client_packages", {
  clientId: uuid("client_id")
    .primaryKey()
    .references(() => clients.id, { onDelete: "cascade" }),
  package: text("package").notNull(),
  smsRegistered: boolean("sms_registered").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureOverrides = core.table("feature_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  locationId: uuid("location_id"),
  feature: text("feature").notNull(),
  level: text("level").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = core.table("audit_log", {
  seq: bigint("seq", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  locationId: uuid("location_id"),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  agentVersion: integer("agent_version"),
  action: text("action").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  decision: text("decision").notNull(),
  approverId: text("approver_id"),
  reason: text("reason"),
  costTokens: integer("cost_tokens"),
  costCents: integer("cost_cents"),
});

export const approvalRequests = core.table("approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  locationId: uuid("location_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  requestedByType: text("requested_by_type").notNull(),
  requestedById: text("requested_by_id").notNull(),
  itemType: text("item_type").notNull(),
  itemRef: text("item_ref").notNull(),
  summary: text("summary").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("pending"),
  editedPayload: jsonb("edited_payload"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
});

export const killSwitches = core.table("kill_switches", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  setBy: text("set_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignments = core.table("assignments", {
  userId: text("user_id").notNull(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const locationAssignments = core.table("location_assignments", {
  userId: text("user_id").notNull(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const processedEvents = core.table("processed_events", {
  consumer: text("consumer").notNull(),
  eventId: uuid("event_id").notNull(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = core.table("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  channel: text("channel").notNull(),
  purpose: text("purpose").notNull(),
  recipientType: text("recipient_type").notNull(),
  recipientId: text("recipient_id").notNull(),
  toMasked: text("to_masked").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  transport: text("transport").notNull().default("dev"),
  status: text("status").notNull().default("recorded"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
