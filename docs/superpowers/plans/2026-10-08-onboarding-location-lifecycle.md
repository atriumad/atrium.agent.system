# Client onboarding and location lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A business requests access, the agency approves and the owner gets in; the owner asks for locations, the agency approves them; only an `active` location collects surveys and receives review requests.

**Architecture:** `core.locations` gains a `status`; a Postgres `security definer` function exposes the status to public flows; every public/survey/Ask path checks it; a new `core.onboarding_requests` table plus use cases create client, organization, owner user and first location on approval; Better Auth's reset-password flow issues a one-time set-password link that the approver hands over. Hono routes and three screens (Hub, Manager, Platform) sit on top.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle + Postgres RLS, Better Auth 1.7, Next.js 16 + React 19 (`packages/ui`), `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-08-onboarding-location-lifecycle-design.md`

## Global Constraints

- Role matrix is pure data in `modules/core/domain/roles.ts`.
- Dependency boundaries enforced by `bun run check:deps`: cross-module imports only through each module's `index.ts`.
- Location statuses: exactly `pending`, `active`, `suspended`, `rejected`. Legal transitions: pending→active, pending→rejected, active→suspended, suspended→active. Nothing else.
- Existing locations migrate to `active`. A client scope may insert only `pending` locations and may never change `status`; agency scope is unrestricted.
- A location that is not `active` is treated as unknown by every public path (same response as a missing one).
- No open sign-up: the public endpoint only creates an onboarding request and always answers 202.
- The set-password link is shown once to the approver and expires in 7 days (`resetPasswordTokenExpiresIn: 604800`).
- Tests hit real Postgres (`docker compose up -d postgres`); migrations through `bun run db:migrate`. Load env first: `set -a && . ./.env.local && set +a`.
- English code, commits and comments. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- The working tree has unrelated uncommitted work. Stage only the files each task names; never `git add -A`.

## Review Focus

- A `pending` and a `suspended` location must be refused by: QR GET/POST and `/info`, invitation GET/POST and `/info`, `submitSurvey`, `scheduleReviewRequest`, `sendReviewRequest`, manual links, forms QR; and an `active` one must still work.
- Owner tries to insert an `active` location, or update `status` of their own, directly through the database scope: must fail.
- Approving an onboarding request where a later step fails: no orphan user, request stays `open`, retry works.
- Two open onboarding requests with the same email: the second is not stored (or is merged) and the public answer is identical (202).
- Account manager not assigned to a client tries to decide on its location: 404, not 403.
- Time zone `"Nowhere/Land"` rejected on `requestLocation` and on the public form.

## File Structure

- Create `modules/core/migrations/0011_location_lifecycle.sql`, `0012_onboarding_requests.sql`.
- Modify `modules/core/infra/schema.ts` (locations status columns, `onboardingRequests` table).
- Modify `modules/core/domain/roles.ts` (+ test), create `modules/core/domain/location-status.ts`.
- Create `modules/core/application/locations.ts` (request/decide), `onboarding.ts` (public submit, list, approve, reject), `setup-link.ts` (capture helper).
- Modify `modules/core/infra/auth.ts` (`sendResetPassword`), `modules/core/index.ts` (exports).
- Modify reputation: `application/survey.ts`, `application/requests.ts`, `application/admin.ts`, `index.ts`; `apps/api/src/survey.ts`.
- Modify `apps/agents/src/gateway.ts` (act only on active locations).
- Create `apps/api/src/locations.ts`, `apps/api/src/onboarding.ts`; modify `apps/api/src/app.ts`, `cases.ts`, `server.ts`.
- UI: create `packages/ui/src/approvals-app.tsx`, `places-panel.tsx`, `request-access.tsx`, `set-password.tsx`; modify `api.ts`, `surveys-app.tsx`, `index.ts`; add pages in `apps/hub`, `apps/manager`, `apps/platform`.
- Tests under each module/app `tests/`.

---

### Task 1: Permission `location:request`

**Files:**
- Modify: `modules/core/domain/roles.ts`
- Test: `modules/core/tests/roles.test.ts`

**Interfaces:**
- Produces: `can(role, "location", "request")` true only for `client_owner`.

- [ ] **Step 1: Failing test** — add inside `describe("permission matrix")`:

```ts
  test("only the owner can ask for a location; the agency decides", () => {
    expect(ROLES.filter((r) => can(r, "location", "request"))).toEqual(["client_owner"]);
    expect(ROLES.filter((r) => can(r, "location", "manage"))).toEqual([
      "agency_admin",
      "account_manager",
    ]);
  });
```

- [ ] **Step 2: Run** `bun test modules/core/tests/roles.test.ts` — Expected: FAIL (type error / not granted).
- [ ] **Step 3: Implement** — in `PERMISSIONS` set `location: ["read", "manage", "request"],` and in the matrix give `client_owner` `location: ["read", "request"],`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add modules/core/domain/roles.ts modules/core/tests/roles.test.ts
git commit -m "feat(core): owners can request locations" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Location status in the database and RLS

**Files:**
- Create: `modules/core/migrations/0011_location_lifecycle.sql`, `modules/core/domain/location-status.ts`
- Modify: `modules/core/infra/schema.ts:23-32`, `modules/core/index.ts`
- Test: `modules/core/tests/location-status.test.ts` (create)

**Interfaces:**
- Produces: `LOCATION_STATUSES`, `type LocationStatus`, `canTransitionLocation(from, to): boolean`; table columns `status`, `statusChangedAt`, `statusChangedBy`, `statusReason` on `locations`; SQL `core.public_location_status(uuid) returns text`; helper `locationStatusFor(db, locationId): Promise<LocationStatus | null>`.

- [ ] **Step 1: Failing test** — create `modules/core/tests/location-status.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { eq, sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  canTransitionLocation,
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  locationStatusFor,
  type Scope,
  withAgency,
  withScope,
} from "../index";
import { locations } from "../infra/schema";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
let clientId = "";
let active = "";
const owner = (): Scope => ({ kind: "client", userId: `o-${suffix}`, role: "client_owner", clientId });

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-ls2-${suffix}` });
    clientId = (await createClientWithOrganization(tx, { name: "LS", slug: `ls2-${suffix}` }))
      .client.id;
    active = (await createLocation(tx, clientId, { name: "Main", timeZone: "America/Chicago" })).id;
  });
});
afterAll(async () => {
  await withAgency(db, (tx) => tx.execute(sql`delete from core.clients where slug = ${`ls2-${suffix}`}`));
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("transitions", () => {
  test("only the agreed moves are legal", () => {
    expect(canTransitionLocation("pending", "active")).toBe(true);
    expect(canTransitionLocation("pending", "rejected")).toBe(true);
    expect(canTransitionLocation("active", "suspended")).toBe(true);
    expect(canTransitionLocation("suspended", "active")).toBe(true);
    expect(canTransitionLocation("rejected", "active")).toBe(false);
    expect(canTransitionLocation("active", "pending")).toBe(false);
    expect(canTransitionLocation("pending", "suspended")).toBe(false);
  });
});

describe("database", () => {
  test("existing and agency-created locations are active", async () => {
    expect(await locationStatusFor(db, active)).toBe("active");
  });

  test("an unknown location has no status", async () => {
    expect(await locationStatusFor(db, crypto.randomUUID())).toBeNull();
  });

  test("an owner can insert a pending location but not an active one", async () => {
    const pending = await withScope(db, owner(), async (tx) => {
      const [row] = await tx
        .insert(locations)
        .values({ clientId, name: "Patio", timeZone: "America/Chicago", status: "pending" })
        .returning({ id: locations.id });
      return row?.id as string;
    });
    expect(await locationStatusFor(db, pending)).toBe("pending");
    await expect(
      withScope(db, owner(), (tx) =>
        tx.insert(locations).values({ clientId, name: "Sneaky", timeZone: "America/Chicago", status: "active" }),
      ),
    ).rejects.toThrow();
  });

  test("an owner cannot change the status of a location", async () => {
    await withScope(db, owner(), (tx) =>
      tx.update(locations).set({ status: "suspended" }).where(eq(locations.id, active)),
    ).catch(() => undefined);
    expect(await locationStatusFor(db, active)).toBe("active");
  });
});
```

- [ ] **Step 2: Run** `set -a && . ./.env.local && set +a && bun test modules/core/tests/location-status.test.ts` — Expected: FAIL (imports missing).

- [ ] **Step 3: Implement.**

`modules/core/domain/location-status.ts`:

```ts
export const LOCATION_STATUSES = ["pending", "active", "suspended", "rejected"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

const MOVES: Record<LocationStatus, readonly LocationStatus[]> = {
  pending: ["active", "rejected"],
  active: ["suspended"],
  suspended: ["active"],
  rejected: [],
};

export function canTransitionLocation(from: LocationStatus, to: LocationStatus): boolean {
  return MOVES[from].includes(to);
}
```

`modules/core/migrations/0011_location_lifecycle.sql`:

```sql
-- Core · a location is tracked only while it is active. Existing rows stay active.
alter table core.locations
  add column status text not null default 'active'
    check (status in ('pending', 'active', 'suspended', 'rejected')),
  add column status_changed_at timestamptz,
  add column status_changed_by text,
  add column status_reason text;

-- Public flows know a location id before any scope exists; this answers one question only.
create function core.public_location_status(loc uuid) returns text
  language sql stable security definer set search_path = core, pg_temp as
  $$ select status from core.locations where id = loc $$;
revoke all on function core.public_location_status(uuid) from public;
grant execute on function core.public_location_status(uuid) to atrium_app;

-- A client scope may add only pending locations and may not move a status; the agency decides.
alter policy locations_scope on core.locations
  using (
    core.is_agency() or core.is_assigned(client_id)
    or (client_id = core.current_client_id()
        and (core.visible_location_ids() is null or id = any (core.visible_location_ids())))
  )
  with check (
    core.is_agency() or core.is_assigned(client_id)
    or (client_id = core.current_client_id() and status = 'pending')
  );
```

Because the update check also needs "status unchanged" for client scopes, add a trigger in the same file:

```sql
create function core.guard_location_status() returns trigger
  language plpgsql as $$
begin
  if new.status is distinct from old.status and not core.is_agency() and not core.is_assigned(old.client_id) then
    raise exception 'only the agency can change a location status';
  end if;
  return new;
end $$;
create trigger locations_status_guard before update on core.locations
  for each row execute function core.guard_location_status();
```

`schema.ts` locations: add

```ts
  status: text("status").notNull().default("active"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  statusChangedBy: text("status_changed_by"),
  statusReason: text("status_reason"),
```

`modules/core/application/lookups.ts`: add

```ts
export async function locationStatusFor(db: Database, locationId: string): Promise<LocationStatus | null> {
  const rows = await db.execute<{ status: LocationStatus | null }>(
    sql`select core.public_location_status(${locationId}::uuid) as status`,
  );
  return rows[0]?.status ?? null;
}
```

(import `LocationStatus` from `../domain/location-status`). Export from `modules/core/index.ts`: `locationStatusFor`, and `export * from "./domain/location-status";`.

- [ ] **Step 4: Run** `bun run db:migrate && bun test modules/core` — Expected: new tests PASS; existing core tests PASS (the owner path of other tests may insert locations as agency, which stays unrestricted; if an existing test inserts a location through a client scope as `active`, change that test to use `withAgency`).
- [ ] **Step 5: Commit**

```bash
git add modules/core/migrations/0011_location_lifecycle.sql modules/core/domain/location-status.ts modules/core/infra/schema.ts modules/core/application/lookups.ts modules/core/index.ts modules/core/tests/location-status.test.ts
git commit -m "feat(core): location status with RLS and a public status lookup" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Request and decide a location

**Files:**
- Create: `modules/core/application/locations.ts`
- Modify: `modules/core/index.ts`
- Test: `modules/core/tests/locations-lifecycle.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `can(..., "location", "request"|"manage")`, Task 2 `canTransitionLocation`, `alertRecipients`, `sendToUser`, `writeAudit`, `isValidTimeZone`.
- Produces:
  - `requestLocation(tx: Tx, scope: Scope, input: { name: string; timeZone: string }, transport?): Promise<string>` returns the new location id.
  - `decideLocation(tx: Tx, scope: Scope, locationId: string, action: "approve" | "reject" | "suspend" | "reactivate", reason: string | null, transport?): Promise<LocationStatus>`.
  - `class LocationForbiddenError`, `LocationNotFoundError`, `LocationStateError`, `InvalidLocationError`.

- [ ] **Step 1: Failing test** — create `modules/core/tests/locations-lifecycle.test.ts` following the setup pattern of `modules/core/tests/assignments.test.ts` (read it first: it builds an agency org, a client with an owner member, an account manager, and `assignClient`). Cases, each with real calls inside `withScope`:

```ts
test("an owner's request creates a pending location and tells the team", async () => {
  const id = await withScope(db, ownerScope, (tx) =>
    requestLocation(tx, ownerScope, { name: "Heights", timeZone: "America/Chicago" }, transport),
  );
  expect(await locationStatusFor(db, id)).toBe("pending");
  expect(sent.some((m) => m.to === "am@x.test")).toBe(true); // recording transport
});

test("a bad time zone is refused", async () => {
  await expect(
    withScope(db, ownerScope, (tx) => requestLocation(tx, ownerScope, { name: "X", timeZone: "Nowhere/Land" })),
  ).rejects.toBeInstanceOf(InvalidLocationError);
});

test("an owner cannot decide", async () => {
  await expect(
    withScope(db, ownerScope, (tx) => decideLocation(tx, ownerScope, pendingId, "approve", null)),
  ).rejects.toBeInstanceOf(LocationForbiddenError);
});

test("the assigned manager approves; the owner is told; illegal moves fail", async () => {
  expect(await withScope(db, amScope, (tx) => decideLocation(tx, amScope, pendingId, "approve", null, transport))).toBe("active");
  await expect(
    withScope(db, amScope, (tx) => decideLocation(tx, amScope, pendingId, "approve", null)),
  ).rejects.toBeInstanceOf(LocationStateError);
  expect(await withScope(db, amScope, (tx) => decideLocation(tx, amScope, pendingId, "suspend", "late rent"))).toBe("suspended");
});

test("a manager not assigned to the client sees nothing", async () => {
  await expect(
    withScope(db, strangerScope, (tx) => decideLocation(tx, strangerScope, pendingId, "approve", null)),
  ).rejects.toBeInstanceOf(LocationNotFoundError);
});
```

`transport` is `{ name: "test", deliver: async (m) => { sent.push(m); return "sent"; } }` (match the `NotificationTransport` shape in `modules/core/application/notifications.ts`; read it).

- [ ] **Step 2: Run** the file — Expected: FAIL (functions missing).

- [ ] **Step 3: Implement** `modules/core/application/locations.ts`:

```ts
import { eq } from "drizzle-orm";
import { canTransitionLocation, type LocationStatus } from "../domain/location-status";
import { isValidTimeZone } from "../domain/location";
import { can, type Scope } from "../domain/roles";
import type { Tx } from "../infra/db";
import { locations } from "../infra/schema";
import { writeAudit } from "./audit";
import { alertRecipients } from "./lookups";
import { type NotificationTransport, sendToUser } from "./notifications";

export class LocationForbiddenError extends Error {}
export class LocationNotFoundError extends Error {}
export class LocationStateError extends Error {}
export class InvalidLocationError extends Error {}

const ACTIONS = {
  approve: { to: "active", from: "pending" },
  reject: { to: "rejected", from: "pending" },
  suspend: { to: "suspended", from: "active" },
  reactivate: { to: "active", from: "suspended" },
} as const;

const actorOf = (scope: Scope) => ({ type: "user", id: scope.userId }) as const;

export async function requestLocation(
  tx: Tx,
  scope: Scope,
  input: { name: string; timeZone: string },
  transport?: NotificationTransport,
): Promise<string> {
  if (scope.kind !== "client" || !can(scope.role, "location", "request")) {
    throw new LocationForbiddenError(`role ${scope.role} cannot request locations`);
  }
  const name = input.name.trim();
  if (name.length === 0 || name.length > 120) throw new InvalidLocationError("the name is 1 to 120 characters");
  if (!isValidTimeZone(input.timeZone)) throw new InvalidLocationError("unknown time zone");
  const [row] = await tx
    .insert(locations)
    .values({ clientId: scope.clientId, name, timeZone: input.timeZone, status: "pending" })
    .returning({ id: locations.id });
  if (!row) throw new Error("location was not created");
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: scope.clientId,
    locationId: row.id,
    action: "core.request_location",
    input: { name },
    decision: "executed",
  });
  for (const r of await alertRecipients(tx, scope.clientId)) {
    if (r.role === "client_owner") continue;
    await sendToUser(
      tx,
      {
        clientId: scope.clientId,
        userId: r.userId,
        kind: "core.location_requested",
        subject: `A new location is waiting for approval: ${name}`,
        body: `${name} was requested and is pending. Open the Manager to approve or reject it.`,
      },
      transport,
    );
  }
  return row.id;
}

export async function decideLocation(
  tx: Tx,
  scope: Scope,
  locationId: string,
  action: keyof typeof ACTIONS,
  reason: string | null,
  transport?: NotificationTransport,
): Promise<LocationStatus> {
  if (!can(scope.role, "location", "manage")) {
    throw new LocationForbiddenError(`role ${scope.role} cannot decide on locations`);
  }
  const [row] = await tx.select().from(locations).where(eq(locations.id, locationId)); // RLS hides strangers
  if (!row) throw new LocationNotFoundError("location not found");
  const move = ACTIONS[action];
  const current = row.status as LocationStatus;
  if (current !== move.from || !canTransitionLocation(current, move.to)) {
    throw new LocationStateError(`a ${current} location cannot ${action}`);
  }
  await tx
    .update(locations)
    .set({ status: move.to, statusChangedAt: new Date(), statusChangedBy: scope.userId, statusReason: reason })
    .where(eq(locations.id, locationId));
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: row.clientId,
    locationId,
    action: `core.location_${action}`,
    decision: "executed",
    reason,
  });
  for (const r of await alertRecipients(tx, row.clientId)) {
    if (r.role !== "client_owner") continue;
    await sendToUser(
      tx,
      {
        clientId: row.clientId,
        userId: r.userId,
        kind: "core.location_decided",
        subject: `${row.name}: ${move.to}`,
        body: reason ? `${row.name} is now ${move.to}. ${reason}` : `${row.name} is now ${move.to}.`,
      },
      transport,
    );
  }
  return move.to;
}
```

Check `isValidNotificationKind` accepts `core.location_requested` (module.thing pattern); if the notifications table has a kind check constraint, extend it in `0011`. Export all from `modules/core/index.ts`.

- [ ] **Step 4: Run** `bun test modules/core` — Expected: PASS.
- [ ] **Step 5: Commit** (`git add` the three files named above).

---

### Task 4: Activation gate in the survey and Ask paths

**Files:**
- Modify: `apps/api/src/survey.ts` (both `mountSurvey` resolve and `mountQrSurvey.resolve`), `modules/reputation/application/survey.ts` (`resolveInvitation`, `submitSurvey`), `modules/reputation/application/requests.ts` (`scheduleReviewRequest`, `sendReviewRequest`), `modules/reputation/application/admin.ts` (`listSurveyForms`, `createManualInvitation`), `apps/agents/src/gateway.ts`
- Test: `apps/api/tests/location-gate.test.ts` (create), `modules/reputation/tests/flow.test.ts` (add cases)

**Interfaces:**
- Consumes: `locationStatusFor` (Task 2).
- Produces: `SurveyForm` gains `status: LocationStatus`; `qrPath` is null unless active. New skip reason `"location_inactive"` in `ScheduleOutcome` and the `reason` of `sendReviewRequest`.

- [ ] **Step 1: Failing tests.** `apps/api/tests/location-gate.test.ts` follows the setup of `apps/api/tests/surveys-admin.test.ts` (copy its helpers). Create one `active` location, one `pending` and one `suspended` (insert as agency, then `update core.locations set status` via the admin `SQL` connection), plus an owner and a manager. Tests:

```ts
for (const [name, locId] of [["pending", pendingLoc], ["suspended", suspendedLoc]] as const) {
  test(`a ${name} location's QR is dead`, async () => {
    const token = signQrToken(SURVEY_SECRET, locId, 1);
    expect((await app.request(`/q/${token}/info`)).status).toBe(410);
    const post = await app.request(`/q/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }) });
    expect(post.status).toBe(410);
  });
  test(`a ${name} location's one-time link is dead`, async () => {
    // Insert an invitation row for the location through the admin connection (hash of a known token).
    const token = generateInvitationToken();
    await admin.unsafe(
      "insert into reputation.survey_invitations (client_id, location_id, token_hash, channel, expires_at) values ($1,$2,$3,'manual', now() + interval '1 day')",
      [clientA, locId, hashInvitationToken(token)],
    );
    expect((await app.request(`/s/${token}/info`)).status).toBe(410);
    const post = await app.request(`/s/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 5 }) });
    expect(post.status).toBe(410);
  });
  test(`forms of a ${name} location carry no QR and a manual link is refused`, async () => {
    const forms = ((await (await call("admin", "GET", "/api/surveys/forms")).json()) as any).forms;
    const form = forms.find((f: any) => f.locationId === locId);
    expect(form.status).toBe(name);
    expect(form.qrUrl).toBeNull();
    expect((await call("admin", "POST", `/api/surveys/forms/${locId}/link`)).status).toBe(409);
  });
}
test("an active location still works", async () => {
  const token = signQrToken(SURVEY_SECRET, activeLoc, 1);
  expect((await app.request(`/q/${token}/info`)).status).toBe(200);
});
```

In `modules/reputation/tests/flow.test.ts` add: `scheduleReviewRequest` for a pending location returns `{ status: "skipped", reason: "location_inactive" }` and `sendReviewRequest` for a request whose location was suspended after scheduling returns `{ outcome: "skipped", reason: "location_inactive" }` and sends nothing. Mirror that file's existing scheduling test for setup.

- [ ] **Step 2: Run** both files — Expected: FAIL (pending/suspended locations still answer 200).

- [ ] **Step 3: Implement.**
  - `resolveInvitation` (reputation `survey.ts`): after reading the row and before the tenant lookup, `if ((await locationStatusFor(db, row.location_id)) !== "active") return { ok: false, reason: "unknown" };`.
  - `apps/api/src/survey.ts` `mountQrSurvey.resolve`: after `clientIdForLocation`, `if ((await locationStatusFor(deps.db, parsed.locationId)) !== "active") return null;`.
  - `submitSurvey`: for `source.kind === "qr"`, before opening the transaction, `if ((await locationStatusFor(db, source.locationId)) !== "active") throw new InvitationUnavailableError("unknown");` (the invitation path is already covered by `resolveInvitation`).
  - Add the `"location_inactive"` reason to `ScheduleOutcome`; in `scheduleReviewRequest` use the location row: read its status via `locations` (`tx.select({status}).from(locations)` imported from core, or extend `locationOf` to return status — prefer adding `status` to what `listLocations` returns, which already selects all columns) and `if (location.status !== "active") return skip("location_inactive")`. In `sendReviewRequest`, after loading `location`, `if (location.status !== "active") return skip("location_inactive")`.
  - `listSurveyForms`: add `status` to each form (from `listLocationLabels`, extend `LocationLabel`/`listLocationLabels` in `lookups.ts` with `status`), and `qrPath: qrSecret && status === "active" ? ... : null`.
  - `createManualInvitation`: after loading `label`, throw `new SurveyStateError("the location is not active")` when status is not `active` (the route maps it to 409).
  - Gateway (`apps/agents/src/gateway.ts` near line 131): when `locationId` is set and the located row's `status !== "active"`, return `reject(call, 0, "location is not active", manifest)`.
  - Update the `SurveyForm` type in `packages/ui/src/api.ts` with `status: "pending" | "active" | "suspended" | "rejected"`.

- [ ] **Step 4: Run** `bun test apps/api modules/reputation apps/agents` — Expected: PASS, including existing suites (existing locations are `active`).
- [ ] **Step 5: Commit** the touched files.

---

### Task 5: Onboarding requests and account approval

**Files:**
- Create: `modules/core/migrations/0012_onboarding_requests.sql`, `modules/core/application/onboarding.ts`, `modules/core/application/setup-link.ts`
- Modify: `modules/core/infra/schema.ts`, `modules/core/infra/auth.ts`, `modules/core/index.ts`
- Test: `modules/core/tests/onboarding.test.ts` (create)

**Interfaces:**
- Produces:
  - `submitOnboardingRequest(db: Database, input: { businessName; ownerName; ownerEmail; firstLocationName; firstLocationTimeZone; note? }): Promise<void>` (silent on duplicates).
  - `listOnboardingRequests(tx: Tx, scope: Scope)`, `approveOnboardingRequest(db: Database, scope: Scope, requestId: string, deps: { auth: Auth; setup: SetupLinkCapture; redirectTo: string }): Promise<{ clientId: string; setupUrl: string }>`, `rejectOnboardingRequest(db, scope, requestId, reason)`.
  - `createSetupLinkCapture(): { onPasswordSetup(input: { email: string; url: string }): Promise<void>; take(email: string): string | undefined }`.
  - `AuthConfig.onPasswordSetup?: (input: { email: string; url: string }) => Promise<void>`.

- [ ] **Step 1: Failing test** `modules/core/tests/onboarding.test.ts` (same setup as `assignments.test.ts`; `createAuth(db, { ..., onPasswordSetup: setup.onPasswordSetup, trustedOrigins: ["http://localhost:3003"] })`):

```ts
test("the public form stores a request and ignores a repeat from the same email", async () => {
  await submitOnboardingRequest(db, req("dup@x.test"));
  await submitOnboardingRequest(db, req("dup@x.test"));
  const rows = await withAgency(db, (tx) => listOnboardingRequests(tx, adminScope));
  expect(rows.filter((r) => r.ownerEmail === "dup@x.test" && r.status === "open")).toHaveLength(1);
});

test("a bad email or time zone is dropped silently", async () => {
  await submitOnboardingRequest(db, { ...req("not-an-email"), });
  await submitOnboardingRequest(db, { ...req("tz@x.test"), firstLocationTimeZone: "Nowhere/Land" });
  const rows = await withAgency(db, (tx) => listOnboardingRequests(tx, adminScope));
  expect(rows.some((r) => r.ownerEmail === "not-an-email" || r.ownerEmail === "tz@x.test")).toBe(false);
});

test("approval creates client, owner, first active location and a working set-password link", async () => {
  const out = await approveOnboardingRequest(db, amScope, id, { auth, setup, redirectTo: "http://localhost:3003/set-password" });
  expect(out.setupUrl).toContain("/reset-password/");
  // the owner can set a password with the token in the link and then sign in
  const token = new URL(out.setupUrl).pathname.split("/").pop() as string;
  await auth.api.resetPassword({ body: { newPassword: "a-long-password-123", token } });
  const signIn = await auth.api.signInEmail({ body: { email: "owner@x.test", password: "a-long-password-123" } });
  expect(signIn.user.email).toBe("owner@x.test");
  const client = await withAgency(db, (tx) => tx.select().from(clients).where(eq(clients.id, out.clientId)));
  expect(client).toHaveLength(1);
  // the approving account manager is assigned
  expect(await withAgency(db, (tx) => listAssignedClientIds(tx, amId))).toContain(out.clientId);
});

test("a failure after the user is created removes the user and keeps the request open", async () => {
  const boom = { ...setup, onPasswordSetup: async () => { throw new Error("mail down"); } };
  // use an auth whose onPasswordSetup throws, via createAuth with `boom`
  await expect(approveOnboardingRequest(db, amScope, id2, { auth: authBoom, setup: boomCapture, redirectTo })).rejects.toThrow();
  const rows = await withAgency(db, (tx) => listOnboardingRequests(tx, adminScope));
  expect(rows.find((r) => r.id === id2)?.status).toBe("open");
  expect(await admin.unsafe("select 1 from core.users where email = $1", ["boom@x.test"])).toHaveLength(0);
});

test("reject records the reason; a client cannot list or decide", async () => {
  await rejectOnboardingRequest(db, adminScope, id3, "not a restaurant");
  await expect(withScope(db, ownerScope, (tx) => listOnboardingRequests(tx, ownerScope))).rejects.toThrow();
});
```

(`req(email)` builds a valid input; define it at the top of the file.)

- [ ] **Step 2: Run** — Expected: FAIL (missing exports).

- [ ] **Step 3: Implement.**

`0012_onboarding_requests.sql`:

```sql
create table core.onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (length(trim(business_name)) between 1 and 120),
  owner_name text not null check (length(trim(owner_name)) between 1 and 120),
  owner_email text not null,
  first_location_name text not null check (length(trim(first_location_name)) between 1 and 120),
  first_location_time_zone text not null,
  note text check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text,
  reason text,
  client_id uuid references core.clients (id) on delete set null
);
create unique index onboarding_open_email_idx on core.onboarding_requests (lower(owner_email)) where status = 'open';
alter table core.onboarding_requests enable row level security;
alter table core.onboarding_requests force row level security;
create policy onboarding_requests_scope on core.onboarding_requests using (core.is_agency()) with check (core.is_agency());
grant select, update on core.onboarding_requests to atrium_app;

create function core.submit_onboarding_request(
  p_business text, p_owner text, p_email text, p_location text, p_tz text, p_note text
) returns void language sql security definer set search_path = core, pg_temp as $$
  insert into core.onboarding_requests
    (business_name, owner_name, owner_email, first_location_name, first_location_time_zone, note)
  values (p_business, p_owner, lower(trim(p_email)), p_location, p_tz, nullif(p_note, ''))
  on conflict do nothing $$;
revoke all on function core.submit_onboarding_request(text, text, text, text, text, text) from public;
grant execute on function core.submit_onboarding_request(text, text, text, text, text, text) to atrium_app;
```

Add the Drizzle table `onboardingRequests` to `schema.ts` (columns as above, camelCase).

`submitOnboardingRequest`: validate in TypeScript first (email regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`, lengths, `isValidTimeZone`); on any invalid input return without writing; otherwise `db.execute(sql\`select core.submit_onboarding_request(...)\`)`. Never throws on duplicates.

`setup-link.ts`:

```ts
export type SetupLinkCapture = ReturnType<typeof createSetupLinkCapture>;
export function createSetupLinkCapture() {
  const links = new Map<string, string>();
  return {
    onPasswordSetup: async ({ email, url }: { email: string; url: string }) => {
      links.set(email.toLowerCase(), url);
    },
    take(email: string) {
      const key = email.toLowerCase();
      const url = links.get(key);
      links.delete(key);
      return url;
    },
  };
}
```

`auth.ts`: add `onPasswordSetup?` to `AuthConfig`; in `emailAndPassword`:

```ts
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      resetPasswordTokenExpiresIn: 7 * 24 * 3600,
      ...(config.onPasswordSetup
        ? { sendResetPassword: async ({ user, url }) => config.onPasswordSetup?.({ email: user.email, url }) }
        : {}),
    },
```

`approveOnboardingRequest(db, scope, id, deps)`:
1. Require `scope.kind` agency/assigned and `can(scope.role, "location", "manage")`, else `OnboardingForbiddenError`.
2. Load the open request through `withAgency` (throw `OnboardingNotFoundError` / `OnboardingStateError` if missing or not open).
3. Create the user: `auth.api.signUpEmail({ body: { email, password: crypto.randomUUID() + crypto.randomUUID(), name } })`. Remember the user id.
4. Inside one `withAgency` transaction: derive a unique slug (`slugify(businessName)`, try `-2`, `-3`… against `clients.slug`), `createClientWithOrganization`, `createLocation` then update its status/changed fields (agency scope, status `active`), `auth.api.addMember` is not transactional with our tx, so call it after the transaction using the returned organization id with role `client_owner`; `assignClient` for the approver when `scope.role === "account_manager"`; mark the request `approved` with `client_id`, `handled_at`, `handled_by`; `writeAudit`.
5. Call `auth.api.requestPasswordReset({ body: { email, redirectTo: deps.redirectTo } })`; read `deps.setup.take(email)`; if undefined throw.
6. Wrap steps 3–5 in try/catch: on failure delete the created user (`delete from core.users where id = ...` through the owner connection is not available to the app role, so use `auth.$context` internal adapter `deleteUser`, or `db.execute(sql\`delete from core.users where id = ...\`)` if the app role has delete on users — check the grants in `0002_identity.sql` and use the permitted route), delete the client row created in step 4 if it exists, and rethrow. The request stays `open`.
7. Return `{ clientId, setupUrl }`.

`rejectOnboardingRequest(db, scope, id, reason)`: same permission, `open` only, set `rejected`, `reason`, audit.

Export everything from `modules/core/index.ts`.

- [ ] **Step 4: Run** `bun run db:migrate && bun test modules/core` — Expected: PASS.
- [ ] **Step 5: Commit** the new/modified files.

---

### Task 6: API routes

**Files:**
- Create: `apps/api/src/locations.ts`, `apps/api/src/onboarding.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/cases.ts`, `apps/api/src/server.ts`
- Test: `apps/api/tests/onboarding-api.test.ts` (create)

**Interfaces:**
- Consumes: Tasks 3 and 5 functions. `SessionDeps` gains `setup: SetupLinkCapture` and `platformUrl: string`.
- Produces routes (all JSON):
  - Public `POST /onboarding/request` → 202 always (body invalid → still 202; malformed JSON → 202). In-memory limiter: 5 requests per IP per hour → 429 with `{ error: "rate_limited" }` after that. IP from `x-forwarded-for` first value or `"unknown"`.
  - `GET /api/locations` → `{ locations: [{ id, name, clientId, clientName, timeZone, status, statusReason }] }` (scope-filtered by RLS).
  - `POST /api/locations/request` `{ name, timeZone }` → 201 `{ id }` (403 non-owner, 422 invalid).
  - `POST /api/locations/:id/decide` `{ action, reason? }` → 200 `{ status }` (403, 404, 409).
  - `GET /api/onboarding/requests`, `POST /api/onboarding/requests/:id/approve` → `{ clientId, setupUrl }`, `POST /api/onboarding/requests/:id/reject` `{ reason }`.
  - `/me` adds `canRequestLocations`, `canManageLocations`.

- [ ] **Step 1: Failing tests** `apps/api/tests/onboarding-api.test.ts` (setup copied from `surveys-admin.test.ts`, with `setup = createSetupLinkCapture()` passed to `createAuth` and to the session deps):

```ts
test("the public form always answers 202 and stores one request", async () => {
  const body = { businessName: "Casa Nueva", ownerName: "Ana", ownerEmail: `ana-${suffix}@x.test`, firstLocationName: "Centro", firstLocationTimeZone: "America/Chicago" };
  for (let i = 0; i < 2; i++) {
    const res = await app.request("/onboarding/request", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" }, body: JSON.stringify(body) });
    expect(res.status).toBe(202);
  }
  const list = ((await (await call("admin", "GET", "/api/onboarding/requests")).json()) as any).requests;
  expect(list.filter((r: any) => r.ownerEmail === body.ownerEmail)).toHaveLength(1);
});

test("the form is rate limited per address", async () => {
  let last = 202;
  for (let i = 0; i < 7; i++) {
    last = (await app.request("/onboarding/request", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.2" }, body: "{}" })).status;
  }
  expect(last).toBe(429);
});

test("an account manager approves; the owner can set a password and sign in", async () => {
  const res = await call("am", "POST", `/api/onboarding/requests/${reqId}/approve`);
  expect(res.status).toBe(200);
  const out = (await res.json()) as any;
  expect(out.setupUrl).toContain("/reset-password/");
});

test("an owner asks for a location, cannot decide; the assigned manager decides", async () => {
  const asked = await call("owner-a", "POST", "/api/locations/request", { name: "Patio", timeZone: "America/Chicago" });
  expect(asked.status).toBe(201);
  const id = ((await asked.json()) as any).id;
  expect((await call("owner-a", "POST", `/api/locations/${id}/decide`, { action: "approve" })).status).toBe(403);
  expect((await call("am", "POST", `/api/locations/${id}/decide`, { action: "approve" })).status).toBe(200);
  expect((await call("am", "POST", `/api/locations/${id}/decide`, { action: "approve" })).status).toBe(409);
  expect((await call("owner-b", "POST", "/api/locations/request", { name: "X", timeZone: "Nowhere/Land" })).status).toBe(422);
});

test("a manager not assigned to the client gets 404", async () => {
  expect((await call("am-other", "POST", `/api/locations/${id}/decide`, { action: "suspend" })).status).toBe(404);
});

test("/me carries the location capabilities", async () => {
  expect(await mine("owner-a")).toMatchObject({ canRequestLocations: true, canManageLocations: false });
  expect(await mine("am")).toMatchObject({ canRequestLocations: false, canManageLocations: true });
});
```

- [ ] **Step 2: Run** — Expected: FAIL (404 on the new routes).
- [ ] **Step 3: Implement.** `onboarding.ts` exports `mountOnboardingPublic(app, deps)` (the public route and limiter, mounted from `createApp` regardless of session) and `mountOnboardingAdmin(api, deps, session)`; `locations.ts` exports `mountLocations(api, deps)`. Error mapping mirrors `surveys-admin.ts` `guard`: `LocationForbiddenError`/`OnboardingForbiddenError` → 403, `*NotFoundError` → 404, `LocationStateError`/`OnboardingStateError` → 409, `InvalidLocationError` → 422. `approve` passes `redirectTo: \`${session.platformUrl}/set-password\``. Mount both admin modules next to `mountSurveyAdmin` in `cases.ts`, add the `/me` flags, and in `server.ts` create `const setup = createSetupLinkCapture()`, pass `onPasswordSetup: setup.onPasswordSetup` to `createAuth`, and `setup`, `platformUrl: process.env.PLATFORM_URL ?? "http://localhost:3003"` to the session deps; add `PLATFORM_URL=http://localhost:3003` to `.env.example` and include it in `TRUSTED_ORIGINS` defaults.
- [ ] **Step 4: Run** `bun test apps/api` — Expected: PASS.
- [ ] **Step 5: Commit** the files named above.

---

### Task 7: Screens

**Files:**
- Create: `packages/ui/src/request-access.tsx`, `packages/ui/src/set-password.tsx`, `packages/ui/src/approvals-app.tsx`, `packages/ui/src/places-panel.tsx`; pages `apps/hub/app/request-access/page.tsx`, `apps/platform/app/set-password/page.tsx`, `apps/manager/app/approvals/page.tsx`
- Modify: `packages/ui/src/api.ts`, `packages/ui/src/index.ts`, `packages/ui/src/surveys-app.tsx`, `packages/ui/src/cases-app.tsx` (nav), `apps/hub/next.config.ts` (rewrite `/onboarding-api` → `${API_URL}/onboarding/request`), `apps/hub/app/page.tsx` (link)
- Test: `packages/ui/tests/approvals.test.tsx`, `packages/ui/tests/places.test.tsx`

**Interfaces:**
- Consumes: Task 6 routes and `/me` flags. `api.ts` gains: `locations()`, `requestLocation(name, timeZone)`, `decideLocation(id, action, reason?)`, `onboardingRequests()`, `approveOnboarding(id)`, `rejectOnboarding(id, reason)`, and `Me.canRequestLocations`, `Me.canManageLocations`.
- Produces components: `RequestAccessForm` (public, posts to `/onboarding-api`), `SetPasswordForm` (reads `token` from the query string, posts `{ newPassword, token }` to `/api/auth/reset-password`, then links to `/`), `ApprovalsApp` (Manager: tabs *Accounts* and *Locations*), `PlacesPanel` (Platform: list with status badges and "Add a place").

- [ ] **Step 1: Failing tests.** `places.test.tsx`: render `PlacesPanel` with a mocked `api` module (use `mock.module("../src/api", ...)` as other UI tests do; read `packages/ui/tests/data.test.tsx` first) returning one `active` and one `pending` place; expect the badges "Active" and "Waiting for approval", and that submitting "Add a place" calls `requestLocation` with the entered values. `approvals.test.tsx`: render the Accounts tab with one open request; clicking "Approve" shows the returned setup URL and the text "shown once"; the Locations tab shows Approve and Reject (reject asks for a reason).
- [ ] **Step 2: Run** `bun run --filter @atrium/ui test` — Expected: FAIL.
- [ ] **Step 3: Implement** with the existing primitives (`Card`, `Badge`/`StatusBadge`, `Tabs`, `Banner`, `Button`, `TextField`, `Select`, `ConfirmDialog`, `CopyButton` pattern from `surveys-app.tsx`; export `CopyButton` from there or move it to a small shared file). In `surveys-app.tsx` `FormCard`, when `form.status !== "active"` render a `Banner status="info"` "Waiting for approval" instead of the QR block and hide the link button. Add a "My places" tab to `ClientWorkspace` (visible when `me.canRequestLocations`), and the nav link "Approvals" in the Manager when `me.canManageLocations` (extend `SectionNav` links in `cases-app.tsx` and `AdminWorkspace`). Pages are thin wrappers like `apps/manager/app/surveys/page.tsx`.
- [ ] **Step 4: Run** `bun run --filter @atrium/ui test && bun run typecheck && bun run lint && bun run check:deps` — Expected: all PASS.
- [ ] **Step 5: Commit** the files named above.

---

### Task 8: Verify end to end

- [ ] **Step 1:** `set -a && . ./.env.local && set +a && bun run ci` — Expected: PASS. Report any failure that lives only in files outside this plan instead of fixing it.
- [ ] **Step 2: Manual walk-through** (API :3001, Hub :3004, Manager :3002, Platform :3003): submit `/request-access` on the Hub; in the Manager open Approvals → Accounts, approve it, copy the setup link, open it, set a password, sign in on the Platform; add a place → it shows "Waiting for approval" and its QR URL answers 410; approve it in the Manager → the QR shows and the Hub survey opens. Report what you could not run.

---

## Self-review notes

- Spec coverage: states and RLS (Task 2), permission (1), request/decide with notifications and audit (3), activation gate items 1–7 (Task 4: items 1,2,3 via QR/invitation/submit; 4 scheduling/sending; 5 forms; 6 manual link; 7 gateway), onboarding with set-password link and compensation (5), API incl. rate limit and `/me` (6), screens (7), verification (8).
- The compensation step in Task 5 must use whichever delete path the app role is granted; the executor checks `0002_identity.sql` first and records a ruling if the plan's route is not permitted.
