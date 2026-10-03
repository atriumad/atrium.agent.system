/** Public API of Core. Other modules import this file, never Core's tables. */

export type { GuestDeps, GuestInput, Publish } from "./application/guests";
export {
  canContact,
  contactFor,
  eraseGuest,
  IdentityConflictError,
  InvalidContactError,
  recordConsent,
  recordOptOut,
  resolveGuest,
} from "./application/guests";
export {
  createAgencyOrganization,
  createClientWithOrganization,
} from "./application/provisioning";
export type { SessionIdentity } from "./application/scope";
export { resolveScope } from "./application/scope";
export * from "./domain/contact";
export { isValidTimeZone, localDay } from "./domain/location";
export * from "./domain/roles";
export type { Auth, AuthConfig } from "./infra/auth";
export { createAuth } from "./infra/auth";
export type { Database, Tx } from "./infra/db";
export { createDatabase, withAgency, withTenant } from "./infra/db";
export type { EventBus, EventHandler, RetryPolicy, SubscribeOptions } from "./infra/event-bus";
export { createEventBus, DEAD_LETTER_QUEUE, DEFAULT_RETRY, deliver } from "./infra/event-bus";
export type { NewClient, NewLocation } from "./infra/tenancy-repository";
export { createClient, createLocation, listLocations } from "./infra/tenancy-repository";
