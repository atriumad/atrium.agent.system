import {
  boolean,
  date,
  integer,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const reputation = pgSchema("reputation");
const at = (name: string) => timestamp(name, { withTimezone: true });

export const locationSettings = reputation.table("location_settings", {
  locationId: uuid("location_id").primaryKey(),
  clientId: uuid("client_id").notNull(),
  reviewUrl: text("review_url"),
  requestDelayMinutes: integer("request_delay_minutes").notNull().default(120),
  qrVersion: integer("qr_version").notNull().default(1),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

export const surveyInvitations = reputation.table("survey_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  guestId: uuid("guest_id"),
  tokenHash: text("token_hash").notNull(),
  channel: text("channel"),
  createdAt: at("created_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
  usedAt: at("used_at"),
});

export const surveyResponses = reputation.table("survey_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  invitationId: uuid("invitation_id"),
  guestId: uuid("guest_id"),
  deviceHash: text("device_hash"),
  templateVersion: integer("template_version").notNull().default(1),
  rating: smallint("rating").notNull(),
  bestPart: text("best_part"),
  improve: text("improve"),
  comment: text("comment"),
  wantsContact: boolean("wants_contact").notNull().default(false),
  severity: text("severity"),
  reviewClickedAt: at("review_clicked_at"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const recoveryCases = reputation.table("recovery_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  responseId: uuid("response_id").notNull(),
  guestId: uuid("guest_id"),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  openedAt: at("opened_at").notNull().defaultNow(),
  dueAt: at("due_at").notNull(),
  contactedAt: at("contacted_at"),
  resolvedAt: at("resolved_at"),
  resolvedBy: text("resolved_by"),
  note: text("note"),
});

export const reviewRequests = reputation.table("review_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  guestId: uuid("guest_id").notNull(),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("scheduled"),
  sendAt: at("send_at").notNull(),
  sentAt: at("sent_at"),
  skippedReason: text("skipped_reason"),
  invitationId: uuid("invitation_id"),
  createdAt: at("created_at").notNull().defaultNow(),
});

/** A client owner asking the agency for a survey form or link. Only the agency fulfils it. */
export const surveyRequests = reputation.table("survey_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull(),
  locationId: uuid("location_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  requestedByName: text("requested_by_name").notNull(),
  note: text("note"),
  status: text("status").notNull().default("open"),
  createdAt: at("created_at").notNull().defaultNow(),
  handledAt: at("handled_at"),
  handledBy: text("handled_by"),
  response: text("response"),
});
