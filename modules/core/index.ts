/** Public API of Core. Other modules import this file, never Core's tables. */

export type { AccessDeps } from "./application/access";
export {
  accessFor,
  accessLevel,
  clearOverride,
  featureGate,
  getPackage,
  isEnabled,
  setOverride,
  setPackage,
} from "./application/access";
export type { ApprovalItem, ApprovalOutcome, PendingApproval } from "./application/approvals";
export {
  ApprovalAlreadyDecidedError,
  ApprovalForbiddenError,
  ApprovalNotFoundError,
  decideApproval,
  listAllPendingApprovals,
  listPendingApprovals,
  requestApproval,
} from "./application/approvals";
export {
  assignClient,
  assignLocation,
  listAssignedClientIds,
  unassignClient,
  unassignLocation,
} from "./application/assignments";
export type { AuditFilter } from "./application/audit";
export { countAuditSince, listAudit, writeAudit } from "./application/audit";
export type { DeliveryEvent } from "./application/delivery";
export { applyDeliveryEvent } from "./application/delivery";
export type { GuestDeps, GuestInput, Publish } from "./application/guests";
export {
  canContact,
  contactFor,
  eraseGuest,
  IdentityConflictError,
  InvalidContactError,
  phoneFor,
  recordConsent,
  recordOptOut,
  resolveGuest,
} from "./application/guests";
export { isAgentActive, switchOff, switchOn } from "./application/kill-switch";
export type { LocationAction } from "./application/locations";
export {
  decideLocation,
  InvalidLocationError,
  LOCATION_ACTIONS,
  LocationForbiddenError,
  LocationNotFoundError,
  LocationStateError,
  requestLocation,
} from "./application/locations";
export type { AlertRecipient, LocationLabel } from "./application/lookups";
export {
  alertRecipients,
  clientIdForLocation,
  describeLocations,
  listLocationLabels,
  locationStatusFor,
  userDisplayNames,
} from "./application/lookups";
export {
  coreJobs,
  PROCESSED_EVENT_RETENTION_DAYS,
  pruneProcessedEvents,
} from "./application/maintenance";
export type { SendResult, UserNotification } from "./application/notifications";
export {
  listNotifications,
  listUserNotifications,
  markUserNotificationsRead,
  sendToGuest,
  sendToUser,
} from "./application/notifications";
export type { ApprovalDeps, OnboardingInput } from "./application/onboarding";
export {
  approveOnboardingRequest,
  listOnboardingRequests,
  OnboardingForbiddenError,
  OnboardingNotFoundError,
  OnboardingStateError,
  rejectOnboardingRequest,
  submitOnboardingRequest,
} from "./application/onboarding";
export {
  createAgencyOrganization,
  createClientWithOrganization,
} from "./application/provisioning";
export type { SessionIdentity } from "./application/scope";
export { resolveScope } from "./application/scope";
export type { SetupLinkCapture } from "./application/setup-link";
export { createSetupLinkCapture } from "./application/setup-link";
export * from "./domain/access";
export * from "./domain/approvals";
export * from "./domain/audit";
export * from "./domain/contact";
export * from "./domain/kill-switch";
export { isValidTimeZone, localDay } from "./domain/location";
export * from "./domain/location-status";
export * from "./domain/notifications";
export * from "./domain/roles";
export { verifySvixSignature } from "./domain/svix";
export { signUnsubscribeToken, verifyUnsubscribeToken } from "./domain/unsubscribe";
export type { Auth, AuthConfig } from "./infra/auth";
export { createAuth } from "./infra/auth";
export type { Database, Tx } from "./infra/db";
export {
  createDatabase,
  withAgency,
  withAssigned,
  withEachTenant,
  withScope,
  withTenant,
} from "./infra/db";
export type {
  ConsumerDefinition,
  EventBus,
  EventHandler,
  JobDefinition,
  RetryPolicy,
  SubscribeOptions,
} from "./infra/event-bus";
export {
  createEventBus,
  DEAD_LETTER_QUEUE,
  DEFAULT_RETRY,
  defineConsumer,
  deliver,
} from "./infra/event-bus";
export { resendTransport, TransportUnavailableError } from "./infra/resend";
export type { NewClient, NewLocation } from "./infra/tenancy-repository";
export {
  createClient,
  createLocation,
  findLocationClients,
  listLocations,
} from "./infra/tenancy-repository";
export { transportFromEnv } from "./infra/transport";
