# Client onboarding and location lifecycle (subprojects B and A)

Date: 2026-10-08 · Status: draft for review

## Why

Today clients and locations are created by hand by an agency admin, and a location has no state:
every location can collect surveys the moment it exists. The agreed flow is: a business asks for
access, the agency approves, the owner gets in, the owner asks for each location, the agency
approves it, and only an **active** location is tracked (QR, surveys, review requests).

## Decisions (agreed in the working session)

- No open sign-up. A public "Request access" form creates an **onboarding request**, not an
  account. An agency admin or account manager approves it.
- On approval the system creates the client, its organization, the owner user and the first
  location, already `active` (approving the account is approving its first place).
- The owner asks for further locations from the Platform; the account manager approves or rejects.
- Location states: `pending`, `active`, `suspended`, `rejected`. Existing locations become `active`.
- Only an `active` location collects surveys and receives review requests.
- Out of scope: billing/plans, owner editing location details, Google business verification,
  several owners in the request form. Real email delivery (ADR 0017) is not built.

## Ruling on the invitation (no email transport yet)

Only `devTransport` exists. The owner cannot be told "check your inbox". So approval returns a
**one-time set-password link** to the approver, who hands it to the owner. The same link is also
passed to the notification transport, so real email delivery later needs no flow change.
Implementation: `createAuth` gains `onPasswordSetup?: (input: { email: string; url: string }) =>
Promise<void>` wired to Better Auth's `sendResetPassword`, and `resetPasswordTokenExpiresIn` of 7
days. The user is created with a random throwaway password nobody knows.

## Data model

- `core/migrations/0011_location_lifecycle.sql`
  - `core.locations.status text not null default 'active' check in
    ('pending','active','suspended','rejected')`, plus `status_changed_at timestamptz`,
    `status_changed_by text`, `status_reason text`. Default `active` keeps every existing row
    valid; new rows created by the owner path insert `pending` explicitly.
  - `core.onboarding_requests` (id, business_name, owner_name, owner_email, first_location_name,
    first_location_time_zone, note, status in `open|approved|rejected`, created_at, handled_at,
    handled_by, reason, client_id nullable). RLS: agency scope only. Public submission goes
    through a `security definer` function `core.submit_onboarding_request(...)` that validates
    lengths and email shape and inserts; granted to `atrium_app`. One open request per email.
  - Policy change on `core.locations`: a client scope may insert only `pending` rows
    (`with check`), and may not update `status`. Agency scope unchanged.
- `core.public_location_status(loc uuid) returns text` (security definer, like
  `client_id_for_location`) so public flows can check state before any scope exists.

## Permissions (`roles.ts`)

- `location` gains `request`. `client_owner`: `["read","request"]`. Agency admin and account
  manager keep `manage`; deciding on a location and on an onboarding request both need `manage`.
- Onboarding requests belong to no client yet, so there is no assignment to check: any
  `agency_admin` or `account_manager` may approve or reject one. When an account manager approves,
  they are assigned to the new client.
- Role matrix test updated.

## Application (core)

- `requestLocation(tx, scope, {name, timeZone})`: needs `location:request`; inserts `pending`;
  audits; notifies agency admins and the client's assigned managers (`alertRecipients`).
  Time zone validated with `Intl.supportedValuesOf("timeZone")`.
- `decideLocation(tx, scope, locationId, "approve"|"reject"|"suspend"|"reactivate", reason)`:
  needs `location:manage`; legal transitions only: pending→active|rejected, active→suspended,
  suspended→active; anything else throws `LocationStateError`. Audits; notifies the owner.
- `submitOnboardingRequest(db, input)` (public), `listOnboardingRequests(tx, scope)`,
  `approveOnboardingRequest(db, scope, requestId, auth, {slug?})`: creates client+org
  (`createClientWithOrganization`), the first location as `active`, the owner user
  (`auth.api.signUpEmail` with a random password), membership `client_owner`, assigns the
  approving account manager (`assignClient`) when the approver is not an admin, then issues the
  set-password link. Slug derived from the business name with a numeric suffix on collision.
  `rejectOnboardingRequest(...)` with a reason. Both audited. The whole approval is one
  transaction except the auth calls, which run first; if a later step fails, the created user is
  removed (compensation) so the request stays `open` and can be retried.

## Activation gate (every place a location is used)

A location that is not `active` is treated as unknown by these paths; each gets a test:

1. `GET/POST /q/:token` and `/q/:token/info` (QR) → 410 `unknown`.
2. `GET/POST /s/:token` and `/s/:token/info` (invitation) → 410 `unknown`.
3. `submitSurvey` (both sources) → `InvitationUnavailableError("unknown")`.
4. `scheduleReviewRequest` → skipped with reason `location_inactive`; `sendReviewRequest` →
   skipped with the same reason.
5. `GET /surveys/forms`: inactive locations come back with `qrUrl: null`, `qrPath: null` and
   `status`, so the UI shows "Waiting for approval".
6. `createManualInvitation` → refused for a non-active location (`SurveyStateError`).
7. Agents gateway reads: locations listed with their status; tools that act on a location refuse
   non-active ones (check `apps/agents/src/gateway.ts` call sites in the plan).

## API (`apps/api`)

- Public, outside `/api`: `POST /onboarding/request` (rate limited per IP with a simple
  in-memory limiter; body validated; always returns 202 without revealing whether the email
  exists).
- Session: `POST /api/locations/request` (owner), `GET /api/locations` (status included),
  `POST /api/locations/:id/decide` (agency),
  `GET /api/onboarding/requests`, `POST /api/onboarding/requests/:id/approve` (returns
  `{ clientId, setupUrl }`), `POST /api/onboarding/requests/:id/reject`.
- `/me` adds `canRequestLocations`, `canManageLocations`.

## Screens

- **Hub** (public): `/request-access` form, then a thank-you message. Link from the Hub home.
- **Manager**: new "Approvals" area with two tabs: *Accounts* (onboarding requests; approve shows
  the setup link with a copy button and a warning that it is shown once) and *Locations*
  (pending requests grouped by client; approve, reject with reason; suspend/reactivate on active
  ones). Badge with the open count in the nav.
- **Platform**: a "My places" list with status badges and an "Add a place" form (name and time
  zone). Survey tab shows "Waiting for approval" for non-active places instead of a QR.
- Reuse `Tabs`, `Card`, `Badge`, `ConfirmDialog`, `CopyButton`; no new design primitives.

## Testing

- Role matrix for `location:request`.
- Core: state machine (every legal and a sample of illegal transitions), RLS (owner cannot insert
  `active`, cannot update `status`; agency can), `submit_onboarding_request` validation and
  duplicate handling.
- Approval: creates client, org, owner, first location, assignment, and a usable set-password
  link; failure after user creation removes the user and leaves the request `open`.
- Gate: one test per item in the activation-gate list above, using a `pending` and a `suspended`
  location, plus a regression that an `active` one still works.
- API: owner requests a location (201, `pending`), owner cannot decide (403), AM decides, an AM
  not assigned to the client cannot decide (404), public onboarding endpoint rate limit and 202.
- UI: Manager approvals tabs and Platform places by capability flags.

## Risks

- Any public path that forgets the status check lets guests answer for an unapproved place: the
  gate list is the checklist, and the final review verifies each item against the code.
- The compensation in approval is the one non-transactional step; it gets its own failure test.
- Slug collisions and duplicate business names: slug suffix handles the first; the second is a
  human decision at approval time.
