# Survey owner self-service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client owner runs surveys for their own locations (see QR, one-off links, send delay); the agency keeps the risky settings; a location manager sees only their location's answers and cases.

**Architecture:** Split the `survey` permission into finer actions in the role matrix, enforce them in the reputation use cases and API routes, add a Postgres RLS migration so location-scoped `client_staff` cannot read other locations' responses or cases, and make the Platform survey screen a tabbed workspace driven by capability flags from `/me`.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle + Postgres RLS, Next.js 16 + React 19 (`packages/ui`), `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-08-survey-owner-self-service-design.md`

## Global Constraints

- Role matrix is pure data in `modules/core/domain/roles.ts`; no framework imports there.
- Dependency boundaries are enforced by `bun run check:deps`; do not import across modules except through each module's `index.ts`.
- `client_owner`: `read`, `forms`, `operate`, `request`. NOT `manage`.
- `client_staff`: `read` only, narrowed to assigned locations. NOT `forms`.
- `agency_staff`: `read`, `forms`. `agency_admin` and `account_manager`: all but `request`.
- Owner must get 403 on changing `reviewUrl` and on `rotate-qr`; a request mixing `reviewUrl` and delay from an owner is rejected whole (nothing saved).
- Tests hit a real Postgres (`docker compose up -d postgres`); migrations run via `scripts/migrate.ts`.
- Code, commits and comments in English. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- The working tree has unrelated uncommitted work. Stage only the files named in each task (`git add <paths>`), never `git add -A`.

## Review Focus

- Owner sends `{ reviewUrl, requestDelayMinutes }` together: whole request must be 403 and the delay must stay unchanged.
- `client_staff` with an empty location list (`locationIds: []`) sees zero responses and zero cases, not all.
- Agency and `client_owner` (location list null) still see every location after the RLS change.
- `client_staff` calling `GET /surveys/forms` or `GET /surveys/locations` gets 403 (QR must never leak to them).
- Owner of client A cannot create a link or read forms for a location of client B (404, not 403 leak).

## File Structure

- Modify `modules/core/domain/roles.ts`: new actions `forms`, `operate`; new matrix.
- Modify `modules/core/tests/roles.test.ts`: survey matrix test.
- Create `modules/reputation/migrations/0006_location_scope.sql`: RLS narrowing for responses and cases.
- Create `modules/reputation/tests/location-scope.test.ts`: isolation test.
- Modify `modules/reputation/application/admin.ts`: action checks, location filter.
- Modify `apps/api/src/surveys-admin.ts`: route guards and settings split.
- Modify `apps/api/src/cases.ts`: `/me` flags.
- Modify `apps/api/tests/surveys-admin.test.ts`: new permission behavior.
- Modify `packages/ui/src/api.ts`: `Me` type flags.
- Modify `packages/ui/src/surveys-app.tsx`: `FormCard` capabilities, client workspace tabs.
- Modify `packages/ui/src/index.ts`, `apps/platform/app/surveys/page.tsx`: export rename.
- Modify `packages/ui/src/cases-app.tsx`: nav shows Surveys link for any survey capability.
- Create `packages/ui/tests/surveys-app.test.tsx`: card capability test.

---

### Task 1: Role matrix with finer survey actions

**Files:**
- Modify: `modules/core/domain/roles.ts:30-34,41-77`
- Test: `modules/core/tests/roles.test.ts`

**Interfaces:**
- Produces: `PERMISSIONS.survey = ["read","forms","operate","manage","request"]`; `can(role, "survey", action)` for each. Later tasks use `"forms"` and `"operate"`.

- [ ] **Step 1: Write the failing test** — append inside the `describe("permission matrix", ...)` block in `modules/core/tests/roles.test.ts`:

```ts
  test("survey actions: the owner runs day to day, the agency owns the risky settings", () => {
    const rolesWith = (action: "read" | "forms" | "operate" | "manage" | "request") =>
      ROLES.filter((r) => can(r, "survey", action));
    expect(rolesWith("read")).toEqual([
      "agency_admin",
      "account_manager",
      "agency_staff",
      "client_owner",
      "client_staff",
    ]);
    expect(rolesWith("forms")).toEqual([
      "agency_admin",
      "account_manager",
      "agency_staff",
      "client_owner",
    ]);
    expect(rolesWith("operate")).toEqual(["agency_admin", "account_manager", "client_owner"]);
    expect(rolesWith("manage")).toEqual(["agency_admin", "account_manager"]);
    expect(rolesWith("request")).toEqual(["client_owner"]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test modules/core/tests/roles.test.ts`
Expected: FAIL (type error or `forms` not granted to anyone).

- [ ] **Step 3: Implement** — in `modules/core/domain/roles.ts` replace the survey permission line and comment:

```ts
  // Surveys. read: responses and cases. forms: locations, QR, printable card. operate: one-off
  // links and the send delay. manage: the Google review link and rotating the QR. request: ask
  // the agency for help.
  survey: ["read", "forms", "operate", "manage", "request"],
```

and the matrix entries:

```ts
  agency_admin: { /* ...existing... */ survey: ["read", "forms", "operate", "manage"] },
  account_manager: { /* ...existing... */ survey: ["read", "forms", "operate", "manage"] },
  agency_staff: { /* ...existing... */ survey: ["read", "forms"] },
  client_owner: {
    client: ["read"],
    location: ["read"],
    content: ["read", "approve"],
    survey: ["read", "forms", "operate", "request"],
  },
  client_staff: {
    client: ["read"],
    location: ["read"],
    content: ["read"],
    survey: ["read"],
  },
```

(Keep every other resource line in each entry exactly as it is today; only the `survey` line changes, and `client_staff` gains one.)

- [ ] **Step 4: Run to verify it passes**

Run: `bun test modules/core/tests/roles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/core/domain/roles.ts modules/core/tests/roles.test.ts
git commit -m "feat(core): split survey permissions into read, forms, operate, manage, request" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: RLS narrows responses and cases to visible locations

**Files:**
- Create: `modules/reputation/migrations/0006_location_scope.sql`
- Test: `modules/reputation/tests/location-scope.test.ts` (create)

**Interfaces:**
- Consumes: `core.visible_location_ids()` (null = all, list = narrowed), `withScope` from `@atrium/core`, schema tables `surveyResponses`, `recoveryCases` from `../infra/schema`.
- Produces: tables `reputation.survey_responses` and `reputation.recovery_cases` hide rows of non-visible locations from client scopes.

- [ ] **Step 1: Write the failing test** — create `modules/reputation/tests/location-scope.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  type Scope,
  withAgency,
  withScope,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { recoveryCases, surveyResponses } from "../infra/schema";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);

let clientId = "";
let locA = "";
let locB = "";
const scopeFor = (locationIds?: string[]): Scope => ({
  kind: "client",
  userId: `u-${suffix}`,
  role: locationIds ? "client_staff" : "client_owner",
  clientId,
  ...(locationIds ? { locationIds } : {}),
});

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-ls-${suffix}` });
    const c = await createClientWithOrganization(tx, { name: "Two Places", slug: `ls-${suffix}` });
    clientId = c.client.id;
    locA = (await createLocation(tx, clientId, { name: "A", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, clientId, { name: "B", timeZone: "America/Chicago" })).id;
    for (const locationId of [locA, locB]) {
      const [r] = await tx
        .insert(surveyResponses)
        .values({
          clientId,
          locationId,
          templateVersion: 1,
          rating: 1,
          wantsContact: false,
          createdAt: new Date(),
        })
        .returning({ id: surveyResponses.id });
      await tx.insert(recoveryCases).values({
        clientId,
        locationId,
        responseId: (r as { id: string }).id,
        severity: "high",
        openedAt: new Date(),
        dueAt: new Date(),
      });
    }
  });
});

afterAll(async () => {
  await withAgency(db, (tx) => tx.execute(sql`delete from core.clients where slug = ${`ls-${suffix}`}`));
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

const seen = (scope: Scope) =>
  withScope(db, scope, async (tx) => ({
    responses: (await tx.select().from(surveyResponses)).map((r) => r.locationId).sort(),
    cases: (await tx.select().from(recoveryCases)).map((r) => r.locationId).sort(),
  }));

describe("location scope on responses and cases", () => {
  test("a location manager sees only their location", async () => {
    expect(await seen(scopeFor([locA]))).toEqual({ responses: [locA], cases: [locA] });
  });

  test("a location manager with no locations sees nothing", async () => {
    expect(await seen(scopeFor([]))).toEqual({ responses: [], cases: [] });
  });

  test("the owner sees every location", async () => {
    const both = [locA, locB].sort();
    expect(await seen(scopeFor())).toEqual({ responses: both, cases: both });
  });

  test("the agency sees every location", async () => {
    const both = [locA, locB].sort();
    const result = await withAgency(db, async (tx) => ({
      responses: (await tx.select().from(surveyResponses))
        .filter((r) => r.clientId === clientId)
        .map((r) => r.locationId)
        .sort(),
    }));
    expect(result.responses).toEqual(both);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test modules/reputation/tests/location-scope.test.ts`
Expected: FAIL — the location manager sees both locations.

- [ ] **Step 3: Write the migration** — `modules/reputation/migrations/0006_location_scope.sql`:

```sql
-- Reputation · a location-scoped client user (a location manager) sees only the responses and
-- cases of their own locations. core.visible_location_ids() is null for the owner and the agency,
-- so they are unaffected. Any other reputation table a location manager can read later must adopt
-- the same predicate.
do $$
declare t text;
begin
  foreach t in array array['survey_responses', 'recovery_cases']
  loop
    execute format(
      'alter policy %I on reputation.%I
         using (
           core.is_agency() or core.is_assigned(client_id)
           or (client_id = core.current_client_id()
               and (core.visible_location_ids() is null
                    or location_id = any (core.visible_location_ids())))
         )
         with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())',
      t || '_scope', t);
  end loop;
end $$;
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run db:migrate && bun test modules/reputation/tests`
Expected: migration applies `reputation/0006_location_scope.sql`; all reputation tests PASS (existing flow tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add modules/reputation/migrations/0006_location_scope.sql modules/reputation/tests/location-scope.test.ts
git commit -m "feat(reputation): scope responses and cases to the user's visible locations" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Use cases check the new actions

**Files:**
- Modify: `modules/reputation/application/admin.ts:27-31,52-91,106-112,135-141`

**Interfaces:**
- Consumes: `can`, `locationVisible` from `@atrium/core` (check both are exported from `modules/core/index.ts`; `locationVisible` is exported from `roles.ts` — add to the index export if missing).
- Produces: `assertCan(scope, "read" | "forms" | "operate" | "manage" | "request")`; `listSurveyForms` requires `forms`; `createManualInvitation` requires `operate`; `listSurveyResponses` drops rows for non-visible locations.

- [ ] **Step 1: Write the failing test** — add to `apps/api/tests/surveys-admin.test.ts` in Task 4 (API-level behavior covers these use cases; no separate unit test file). Skip to Step 3 here; verification runs in Task 4.

- [ ] **Step 2: Confirm exports**

Run: `grep -n "locationVisible" modules/core/index.ts`
If absent, add `locationVisible` to the `./domain/roles` export list in `modules/core/index.ts`.

- [ ] **Step 3: Implement** — in `admin.ts`:

```ts
type SurveyAction = "read" | "forms" | "operate" | "manage" | "request";

function assertCan(scope: Scope, action: SurveyAction) {
  if (!can(scope.role, "survey", action)) {
    throw new SurveyForbiddenError(`role ${scope.role} cannot ${action} surveys`);
  }
}
```

In `listSurveyForms`, replace `assertCan(scope, "read")` with `assertCan(scope, "forms")`.
In `createManualInvitation`, replace `assertCan(scope, "manage")` with `assertCan(scope, "operate")`.
In `listSurveyResponses`, after building the mapped rows, filter: `.filter((row) => locationVisible(scope, row.locationId))` (import `locationVisible` from `@atrium/core`). `handleSurveyRequest` keeps `"manage"`.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add modules/reputation/application/admin.ts modules/core/index.ts
git commit -m "feat(reputation): gate forms and links with the finer survey actions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API routes, `/me` flags and tests

**Files:**
- Modify: `apps/api/src/surveys-admin.ts:35-48 (locations route), 99-160`
- Modify: `apps/api/src/cases.ts:66-68`
- Modify: `apps/api/tests/surveys-admin.test.ts` (the "who can do what" block and the `userWith` setup)

**Interfaces:**
- Produces `/me` fields: `canViewForms: boolean`, `canOperateSurveys: boolean` (in addition to existing `canReadSurveys`, `canManageSurveys`, `canRequestSurveys`). Task 5 reads them.

- [ ] **Step 1: Write the failing tests** — in `apps/api/tests/surveys-admin.test.ts`:

Add to the imports `assignLocation` and a `locA2` second location for client A. In `beforeAll`, after `locA` creation:

```ts
    locA2 = (await createLocation(tx, clientA, { name: "Heights", timeZone: "America/Chicago" })).id;
```

(declare `let locA2 = "";` next to `locA`), and after `userWith("owner-b", ...)`:

```ts
  const mgrId = await userWith("mgr-a", orgA, "client_staff");
  await withAgency(db, (tx) =>
    assignLocation(tx, mgrId, clientA, locA, { type: "user", id: `seed-${suffix}` }),
  );
```

Replace the `"/me tells each role..."` expectation for `owner-a` and the test `"a client cannot read responses, forms or build links"` with:

```ts
    expect(await mine("owner-a")).toMatchObject({
      canReadSurveys: true,
      canViewForms: true,
      canOperateSurveys: true,
      canManageSurveys: false,
      canRequestSurveys: true,
    });
    expect(await mine("mgr-a")).toMatchObject({
      canReadSurveys: true,
      canViewForms: false,
      canOperateSurveys: false,
      canRequestSurveys: false,
    });
```

```ts
  test("an owner runs links and delay but not the review link or the QR", async () => {
    expect((await call("owner-a", "GET", "/api/surveys/forms")).status).toBe(200);
    expect((await call("owner-a", "POST", `/api/surveys/forms/${locA}/link`)).status).toBe(200);
    expect(
      (await call("owner-a", "PUT", `/api/surveys/forms/${locA}/settings`, { requestDelayMinutes: 45 }))
        .status,
    ).toBe(200);
    expect((await call("owner-a", "POST", `/api/surveys/forms/${locA}/rotate-qr`)).status).toBe(403);
    expect(
      (await call("owner-a", "PUT", `/api/surveys/forms/${locA}/settings`, {
        reviewUrl: "https://g.page/r/evil/review",
      })).status,
    ).toBe(403);
  });

  test("an owner sending the review link with the delay is rejected whole", async () => {
    const before = ((await (await call("admin", "GET", "/api/surveys/forms")).json()) as any).forms.find(
      (f: any) => f.locationId === locA,
    );
    const res = await call("owner-a", "PUT", `/api/surveys/forms/${locA}/settings`, {
      reviewUrl: "https://g.page/r/evil/review",
      requestDelayMinutes: 999,
    });
    expect(res.status).toBe(403);
    const after = ((await (await call("admin", "GET", "/api/surveys/forms")).json()) as any).forms.find(
      (f: any) => f.locationId === locA,
    );
    expect(after.requestDelayMinutes).toBe(before.requestDelayMinutes);
    expect(after.reviewUrl).toBe(before.reviewUrl);
  });

  test("an owner cannot reach another client's location", async () => {
    expect((await call("owner-a", "POST", `/api/surveys/forms/${locB}/link`)).status).toBe(404);
    const forms = ((await (await call("owner-a", "GET", "/api/surveys/forms")).json()) as any).forms;
    expect(forms.every((f: any) => f.locationId === locA || f.locationId === locA2)).toBe(true);
  });

  test("a location manager reads their location's answers and nothing about forms", async () => {
    expect((await call("mgr-a", "GET", "/api/surveys/forms")).status).toBe(403);
    expect((await call("mgr-a", "GET", "/api/surveys/locations")).status).toBe(403);
    expect((await call("mgr-a", "POST", `/api/surveys/forms/${locA}/link`)).status).toBe(403);
    expect((await call("mgr-a", "GET", "/api/surveys/responses")).status).toBe(200);
  });
```

Update the existing `"a client lists only its own places to ask about"` expectation to `.toEqual([locA, locA2].sort())` after sorting the ids (owner now sees both of client A's locations): `expect(rows.map((l: any) => l.id).sort()).toEqual([locA, locA2].sort());`. Update `"agency staff reads but cannot manage"` only if it breaks (staff keeps `forms`, so `GET forms` still 200).

- [ ] **Step 2: Run to verify they fail**

Run: `bun test apps/api/tests/surveys-admin.test.ts`
Expected: FAIL (owner currently gets 403 on forms; `/me` lacks the new flags).

- [ ] **Step 3: Implement routes** — in `surveys-admin.ts`:

`/surveys/locations`: allow `read`-with-`forms` or `request`:

```ts
    if (!can(role, "survey", "forms") && !can(role, "survey", "request")) {
      return c.json({ error: "forbidden" }, 403);
    }
```

`PUT /surveys/forms/:locationId/settings`: replace the single `manage` check with a split check after parsing the body:

```ts
      const wantsLink = reviewUrl !== undefined;
      const wantsDelay = delay !== undefined;
      if (wantsLink && !can(scope.role, "survey", "manage")) {
        return c.json({ error: "forbidden" }, 403);
      }
      if (wantsDelay && !can(scope.role, "survey", "operate")) {
        return c.json({ error: "forbidden" }, 403);
      }
      if (!wantsLink && !wantsDelay) return c.json({ error: "invalid_request" }, 422);
```

(Place it right after the type validation block and before `withScope`; remove the early `manage` check that precedes body parsing, so an owner sending only the delay passes.) `POST .../link` is guarded in the use case (`operate`); `rotate-qr` keeps its `manage` check; `GET /surveys/forms` is guarded in the use case (`forms`).

In `cases.ts` `/me` add:

```ts
      canViewForms: can(scope.role, "survey", "forms"),
      canOperateSurveys: can(scope.role, "survey", "operate"),
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun test apps/api`
Expected: all PASS. If an assertion elsewhere in the file relied on the owner being forbidden, update it to the new rule.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/surveys-admin.ts apps/api/src/cases.ts apps/api/tests/surveys-admin.test.ts
git commit -m "feat(api): owners run links and delay; review link and QR rotation stay with the agency" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: UI — capability-driven card and client workspace

**Files:**
- Modify: `packages/ui/src/api.ts:3-12` (`Me` type)
- Modify: `packages/ui/src/surveys-app.tsx` (`FormCard`, `Forms`, `SurveysAdminApp`, `ClientWorkspace`, exports)
- Modify: `packages/ui/src/index.ts:20`, `apps/platform/app/surveys/page.tsx`, `packages/ui/src/cases-app.tsx:154-163`
- Test: `packages/ui/tests/surveys-app.test.tsx` (create)

**Interfaces:**
- Consumes `/me` fields from Task 4.
- Produces `export function FormCard({ form, onChanged, canManage, canOperate })` and `export function SurveysClientApp()` (replaces `SurveyRequestApp`).

- [ ] **Step 1: Write the failing test** — create `packages/ui/tests/surveys-app.test.tsx`; follow the render helper used in `packages/ui/tests/forms.test.tsx` (open it first and reuse its imports/`render` setup):

```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { FormCard } from "../src/surveys-app";

const form = {
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Bellaire",
  clientId: "c",
  clientName: "Casa Olivo",
  reviewUrl: "https://g.page/r/abc/review",
  requestDelayMinutes: 120,
  qrVersion: 1,
  qrPath: "/q/x",
  qrUrl: "http://hub.test/q/x",
};

describe("FormCard capabilities", () => {
  test("an owner can generate a link but not rotate the QR or edit the review link", () => {
    const { getByText, getByLabelText, queryByText } = render(
      <FormCard form={form} onChanged={() => {}} canManage={false} canOperate />,
    );
    expect(getByText("Generate link")).toBeTruthy();
    expect(queryByText("Rotate QR")).toBeNull();
    expect((getByLabelText(/Google review link/i) as HTMLInputElement).disabled).toBe(true);
    expect(getByText(/Help tab/i)).toBeTruthy();
  });

  test("the agency sees every control", () => {
    const { getByText, getByLabelText } = render(
      <FormCard form={form} onChanged={() => {}} canManage canOperate />,
    );
    expect(getByText("Rotate QR")).toBeTruthy();
    expect((getByLabelText(/Google review link/i) as HTMLInputElement).disabled).toBe(false);
  });
});
```

If the existing tests use another render library, mirror theirs exactly.

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter @atrium/ui test`
Expected: FAIL — `FormCard` is not exported / has no capability props.

- [ ] **Step 3: Implement**

`api.ts` `Me`: add `canViewForms: boolean; canOperateSurveys: boolean;`.

`surveys-app.tsx`:
- `export function FormCard({ form, onChanged, canManage, canOperate }: { form: SurveyForm; onChanged: () => void; canManage: boolean; canOperate: boolean })`.
- Rotate QR `ConfirmDialog` renders only when `canManage`.
- Google review `TextField` gets `disabled={!canManage}`; when `!canManage` its `hint` reads `Only the Atrium team can change this. Ask for help from the Help tab.`
- Delay `TextField` gets `disabled={!canOperate}`; "Generate link" button renders only when `canOperate`.
- `save()` sends only the fields the user may change: `...(canManage ? { reviewUrl: reviewUrl.trim() || null } : {})` and `...(canOperate ? { requestDelayMinutes: Number(delay) } : {})`.
- `Forms` takes `{ canManage, canOperate }` props and passes them to `FormCard`; `SurveysAdminApp` passes `me.canManageSurveys` / `me.canOperateSurveys`.
- Rename `SurveyRequestApp` to `SurveysClientApp`. `ClientWorkspace` becomes tabbed with `Tabs` (same component as the admin app): `responses` (always, renders `<Responses />`), `locations` (only if `me.canViewForms`, renders `<Forms canManage={false} canOperate={me.canOperateSurveys} />`), `help` (only if `me.canRequestSurveys`, the existing request form and list, retitled "Need help" with description `Ask the Atrium team to change the Google review link, rotate the QR, or help with anything else.`). Default tab is the first available. The "Not available for your role" banner shows only when `!me.canReadSurveys && !me.canRequestSurveys`.
- `Forms` empty state for the client: `No locations yet`.

`index.ts`: `export { SurveysAdminApp, SurveysClientApp } from "./surveys-app";`
`apps/platform/app/surveys/page.tsx`: import and render `SurveysClientApp`.
`cases-app.tsx`: show the nav when `surface === "manager" || me.canReadSurveys || me.canRequestSurveys`; the Platform link label becomes `Surveys`.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run --filter @atrium/ui test && bun run typecheck && bun run lint`
Expected: all PASS / clean. Fix biome complaints with `bun run lint:fix` limited to touched files.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/api.ts packages/ui/src/surveys-app.tsx packages/ui/src/index.ts packages/ui/src/cases-app.tsx apps/platform/app/surveys/page.tsx packages/ui/tests/surveys-app.test.tsx
git commit -m "feat(ui): owner workspace for surveys with capability-driven controls" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verify end to end

**Files:** none (verification only).

- [ ] **Step 1: Full CI**

Run: `bun run ci`
Expected: lint, dependency boundaries, typecheck and all tests PASS. The tree has unrelated uncommitted files; if lint fails only on files outside this plan, report it instead of fixing.

- [ ] **Step 2: Manual walk-through** (API on :3001, Platform on :3003, Hub on :3004)

Run `bun run seed` if there is no demo data. Sign in to the Platform as an owner: the Surveys page shows Responses, My locations, Help tabs; "Generate link" works; Google link is disabled; no "Rotate QR". Sign in as a location manager: only the Responses tab, only their location's rows. Sign in to the Manager as an account manager: all controls present.

- [ ] **Step 3: Report** any step that could not be run, with the output.

---

## Self-review notes

- Spec coverage: matrix (Task 1), location isolation RLS + app filter (Tasks 2, 3), API rules incl. whole-request rejection and `/me` flags (Task 4), screens and Help rewording (Task 5), testing section covered across Tasks 1, 2, 4, 5. The spec's "verify `listLocationLabels` follows location scope" is covered by `locations_scope` (migration 0007, `visible_location_ids`) and the `mgr-a` test in Task 4.
- Note: `client_staff` also keeps case read access through the existing case routes; Task 2's RLS narrows them to assigned locations.
