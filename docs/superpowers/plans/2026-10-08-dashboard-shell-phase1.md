# Dashboard shell, phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manager and Platform get a traditional dashboard: a sidebar with a main menu and submenus, a top bar with the account, one page per section, locked modules shown with a teaser; behavior of every existing screen stays the same.

**Architecture:** `SideNav` gains submenus and locked items. A pure nav config per app turns `Me` (and, for clients, the package's access levels) into the menu. An `AppFrame` in `@atrium/ui` loads the session, handles sign-in, and renders a `DashboardShell`; each Next app wraps its pages in a route group whose layout supplies `usePathname` and `next/link`. Existing tab groups become pages by extracting their bodies into page components that read `useMe()`.

**Tech Stack:** Bun, TypeScript, Hono, Next.js 16 + React 19, `packages/ui` (Base UI, Tailwind 4, lucide-react), `bun test` with happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-08-dashboard-shell-design.md` (phase 1 only)

## Global Constraints

- Two apps stay (ADR 0016); they share the shell and the API. No code of one audience lives in the other app's directory.
- Menu items appear only when `can(role, resource, action)`-equivalent flags on `Me` allow them; locked modules stay visible and link to `/modules/<feature>`.
- No Host menu entries in phase 1 (their pages arrive in phase 2); no dead links anywhere in the menu.
- `packages/ui` does not import `next/*`; the apps pass `linkAs` and `pathname` in.
- Module list and order for the client menu: content, analytics, discoverability, retention, attribution, growth, management, benchmarks. Teaser copy is generic (tiers for growth, management, benchmarks are still "to confirm").
- Old URLs redirect: `/surveys` → `/reputation/responses` (both apps), Manager `/approvals` → `/approvals/accounts`, Platform `/surveys` → `/reputation/responses`.
- Tests: `bun run --filter @atrium/ui test` for UI, `bun test apps/api` for the API (needs `set -a && . ./.env.local && set +a`). Existing UI tests stay green.
- English code and copy; commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage only the files each task names.

## Review Focus

- A location manager (`client_staff`) sees Feedback and Responses only, never "QR & links" or "My places".
- A client whose package locks Reputation sees one locked Reputation item, not its children, and reaches a teaser, not a broken page.
- The current item is correct for nested routes (`/reputation/cases/…`) and `/` only matches the Overview.
- Pressing Esc or the backdrop closes the mobile drawer; focus returns to the menu button.
- Signed-out visitors see the sign-in on every route (deep links), and signing out returns there.
- An account manager's Approvals count equals pending accounts plus pending places.

## File Structure

- Modify `packages/ui/src/navigation/shell.tsx` (submenus, locked) and `tests/navigation-layout.test.tsx`.
- Create `packages/ui/src/shell/nav.ts`, `me-context.tsx`, `app-frame.tsx`, `teaser.tsx`, `overview.tsx`; tests in `packages/ui/tests/nav.test.ts`, `app-frame.test.tsx`, `pages.test.tsx`, helper `tests/fake-api.ts`.
- Create `packages/ui/src/pages.tsx` re-exporting page components; modify `cases-app.tsx`, `surveys-app.tsx`, `approvals-app.tsx`, `places-panel.tsx`, `index.ts`.
- Modify `apps/api/src/cases.ts` (+ `apps/api/tests/access.test.ts`): `GET /api/access`.
- Apps: move pages into `app/(app)/…` route groups, add `app/(app)/layout.tsx` + `app/(app)/frame.tsx`, add redirects in `next.config.ts`, add new route files.

---

### Task 1: SideNav submenus and locked items

**Files:**
- Modify: `packages/ui/src/navigation/shell.tsx`
- Test: `packages/ui/tests/navigation-layout.test.tsx`

**Interfaces:**
- Produces: `SideNavItem` gains `locked?: boolean` and `children?: SideNavItem[]`. `SideNav` props unchanged. `current` may be a child id; the parent shows as current-ancestor (`aria-current="true"` on the toggle, expanded).

- [ ] **Step 1: Failing tests** — add to the `describe("SideNav, TopBar, AppShell")` block:

```tsx
  const nested = [
    {
      items: [
        { id: "overview", label: "Overview", href: "/" },
        {
          id: "reputation",
          label: "Reputation",
          href: "/reputation/cases",
          count: 2,
          children: [
            { id: "cases", label: "Cases", href: "/reputation/cases" },
            { id: "responses", label: "Responses", href: "/reputation/responses" },
          ],
        },
        { id: "growth", label: "Growth", href: "/modules/growth", locked: true },
      ],
    },
  ];

  test("a parent is collapsed until a child is current, then it opens by itself", () => {
    const { rerender } = setup(<SideNav brand="x" groups={nested} current="overview" />);
    const toggle = screen.getByRole("button", { name: /Reputation/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull();
    rerender(<SideNav brand="x" groups={nested} current="responses" />);
    expect(screen.getByRole("button", { name: /Reputation/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Responses" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Cases" }).getAttribute("aria-current")).toBeNull();
  });

  test("clicking a parent toggles its children and keeps the count visible", async () => {
    const { user } = setup(<SideNav brand="x" groups={nested} current="overview" />);
    const toggle = screen.getByRole("button", { name: /Reputation/ });
    expect(within(toggle).getByText("2")).toBeTruthy();
    await user.click(toggle);
    expect(screen.getByRole("link", { name: "Cases" })).toBeTruthy();
    await user.click(toggle);
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull();
  });

  test("a locked item stays a link to its teaser and says it is locked", () => {
    setup(<SideNav brand="x" groups={nested} current="overview" />);
    const link = screen.getByRole("link", { name: /Growth/ });
    expect(link.getAttribute("href")).toBe("/modules/growth");
    expect(link.getAttribute("data-locked")).toBe("true");
    expect(within(link).getByLabelText("Locked")).toBeTruthy();
  });
```

(`rerender` comes from `render`'s return, which `setup` spreads.)

- [ ] **Step 2: Run** `bun run --filter @atrium/ui test` — Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement** — rewrite `SideNav` in `shell.tsx` (add `"use client";` as the first line, import `useState`, `ChevronDown`, `Lock` from `lucide-react`, `Icon` from `../icon`):

```tsx
export type SideNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  count?: number;
  /** A module the package does not include: dimmed, still a link (to its teaser). */
  locked?: boolean;
  children?: SideNavItem[];
};
```

Inside `SideNav`: `const [open, setOpen] = useState<Record<string, boolean>>({});`. For each item: `const hasChildren = (it.children?.length ?? 0) > 0; const childCurrent = it.children?.some((c) => c.id === current) ?? false; const isOpen = open[it.id] ?? childCurrent;`. If `hasChildren`, render

```tsx
<button
  type="button"
  aria-expanded={isOpen}
  aria-current={childCurrent ? "true" : undefined}
  onClick={() => setOpen((o) => ({ ...o, [it.id]: !isOpen }))}
  className={ROW}
>
  {it.icon}
  {it.label}
  {it.count ? <Badge variant="clay" className="ml-auto">{it.count}</Badge> : <span className="ml-auto" />}
  <ChevronDown size={16} strokeWidth={1.5} aria-hidden className={isOpen ? "rotate-180" : ""} />
</button>
{isOpen ? (
  <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pl-5">
    {it.children?.map((c) => (
      <li key={c.id}>
        <LinkAs href={c.href} aria-current={c.id === current ? "page" : undefined} className={ROW}>
          {c.label}
          {c.count ? <Badge variant="clay" className="ml-auto">{c.count}</Badge> : null}
        </LinkAs>
      </li>
    ))}
  </ul>
) : null}
```

For items without children render the existing link, adding `data-locked={it.locked ? "true" : undefined}`, `className={cx(ROW, it.locked && "opacity-60")}` and, when locked, `<Lock aria-label="Locked" role="img" size={14} strokeWidth={1.5} className="ml-auto" />` after the label. `ROW` is the existing class string for a row (flex, gap-3, rounded-sm, px, py, hover and `aria-[current=page]` styles; add `aria-[current=true]:text-lime-500` for the ancestor and `w-full text-left cursor-pointer` so the button matches the link).

- [ ] **Step 4: Run** the UI tests — Expected: all PASS (existing SideNav tests unchanged: items without children render exactly as before).
- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/navigation/shell.tsx packages/ui/tests/navigation-layout.test.tsx
git commit -m "feat(ui): side navigation with submenus and locked items" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Navigation config per app

**Files:**
- Create: `packages/ui/src/shell/nav.ts`
- Test: `packages/ui/tests/nav.test.ts`

**Interfaces:**
- Consumes: `Me` (from `../api`), `SideNavGroup` (from `../navigation/shell`).
- Produces:

```ts
export type Level = "full" | "basic" | "locked";
export type Access = Partial<Record<Module, Level>>;
export const MODULES: readonly { feature: Module; label: string }[];
export type Module = "content" | "analytics" | "discoverability" | "retention" | "attribution" | "growth" | "management" | "benchmarks";
export function managerNav(me: Me, counts: { approvals: number }): SideNavGroup[];
export function platformNav(me: Me, access: Access): SideNavGroup[];
export function activeId(pathname: string, groups: SideNavGroup[]): string;
export function teaserFor(feature: string, level: Level | undefined): { title: string; body: string; locked: boolean } | null;
```

- [ ] **Step 1: Failing tests** — create `packages/ui/tests/nav.test.ts` with a `meOf(over)` helper (a full `Me` with every flag false, `kind`, `role`, `name`, `userId`) and table-driven expectations on the **ids** and **hrefs** flattened from the groups:

```ts
const flat = (groups: ReturnType<typeof managerNav>) =>
  groups.flatMap((g) => g.items.flatMap((i) => [i.id, ...(i.children?.map((c) => c.id) ?? [])]));

test("an account manager sees the whole agency menu", () => {
  const ids = flat(managerNav(meOf({ kind: "assigned", role: "account_manager", canReadSurveys: true, canViewForms: true, canManageLocations: true }), { approvals: 3 }));
  expect(ids).toEqual(["overview", "reputation", "cases", "responses", "forms", "help-requests", "approvals", "approvals-accounts", "approvals-places", "clients", "clients-places"]);
});

test("agency staff has no approvals", () => {
  const ids = flat(managerNav(meOf({ kind: "assigned", role: "agency_staff", canReadSurveys: true, canViewForms: true }), { approvals: 0 }));
  expect(ids).not.toContain("approvals");
});

test("the approvals count rides on the parent", () => {
  const groups = managerNav(meOf({ kind: "agency", role: "agency_admin", canReadSurveys: true, canViewForms: true, canManageLocations: true }), { approvals: 4 });
  expect(groups.flatMap((g) => g.items).find((i) => i.id === "approvals")?.count).toBe(4);
});

const full = { content: "full", analytics: "full", discoverability: "full", retention: "locked", attribution: "basic", growth: "full", management: "full", benchmarks: "locked" } as const;

test("an owner sees reputation, places, help and every module, locked ones marked", () => {
  const groups = platformNav(meOf({ kind: "client", role: "client_owner", canReadSurveys: true, canViewForms: true, canRequestLocations: true, canRequestSurveys: true }), { ...full, reputation: "full" } as never);
  expect(flat(groups).slice(0, 7)).toEqual(["overview", "reputation", "feedback", "responses", "qr", "places", "help"]);
  const modules = groups.at(-1)?.items ?? [];
  expect(modules.map((m) => m.id)).toEqual(["content", "analytics", "discoverability", "retention", "attribution", "growth", "management", "benchmarks"]);
  expect(modules.find((m) => m.id === "retention")?.locked).toBe(true);
  expect(modules.find((m) => m.id === "growth")?.locked).toBeFalsy();
});

test("a location manager sees feedback and responses only", () => {
  const ids = flat(platformNav(meOf({ kind: "client", role: "client_staff", canReadSurveys: true }), { reputation: "full" } as never));
  expect(ids).toContain("feedback");
  expect(ids).toContain("responses");
  expect(ids).not.toContain("qr");
  expect(ids).not.toContain("places");
  expect(ids).not.toContain("help");
});

test("a locked reputation module is one locked item without children", () => {
  const groups = platformNav(meOf({ kind: "client", role: "client_owner", canReadSurveys: true, canViewForms: true, canRequestLocations: true, canRequestSurveys: true }), { reputation: "locked" } as never);
  const rep = groups.flatMap((g) => g.items).find((i) => i.id === "reputation");
  expect(rep?.locked).toBe(true);
  expect(rep?.children).toBeUndefined();
  expect(rep?.href).toBe("/modules/reputation");
});

test("the current item is the longest matching route", () => {
  const groups = managerNav(meOf({ kind: "agency", role: "agency_admin", canReadSurveys: true, canViewForms: true, canManageLocations: true }), { approvals: 0 });
  expect(activeId("/", groups)).toBe("overview");
  expect(activeId("/reputation/cases", groups)).toBe("cases");
  expect(activeId("/reputation/cases/abc", groups)).toBe("cases");
  expect(activeId("/approvals/places", groups)).toBe("approvals-places");
  expect(activeId("/nowhere", groups)).toBe("");
});

test("teasers are honest about what is locked and what is not built yet", () => {
  expect(teaserFor("retention", "locked")).toMatchObject({ locked: true });
  expect(teaserFor("analytics", "full")).toMatchObject({ locked: false, title: expect.stringContaining("Analytics") });
  expect(teaserFor("nonsense", "full")).toBeNull();
});
```

- [ ] **Step 2: Run** `bun test packages/ui/tests/nav.test.ts` (from `packages/ui`: `bun test tests/nav.test.ts`) — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `packages/ui/src/shell/nav.ts`. Icons: `LayoutDashboard` (overview), `MessageSquareHeart` (reputation — if missing in the installed lucide use `Star`), `ShieldCheck` (approvals), `Building2` (clients/places), `LifeBuoy` (help), `MapPin` (my places); modules use `Lock` only through `locked`. Item ids/hrefs exactly:
  - Manager: `overview` `/`; `reputation` (href `/reputation/cases`) children `cases` `/reputation/cases`, `responses` `/reputation/responses` (if `canReadSurveys`), `forms` `/reputation/forms` (if `canViewForms`), `help-requests` `/reputation/help` (if `canViewForms`); `approvals` (href `/approvals/accounts`, `count: counts.approvals || undefined`, only if `canManageLocations`) children `approvals-accounts` `/approvals/accounts`, `approvals-places` `/approvals/places`; `clients` (href `/clients/places`) child `clients-places` `/clients/places`.
  - Platform: `overview` `/`; `reputation` (href `/reputation/feedback`; if `access.reputation === "locked"` then `{ locked: true, href: "/modules/reputation" }` with no children) children `feedback` `/reputation/feedback`, `responses` `/reputation/responses` (if `canReadSurveys`), `qr` `/reputation/qr` (if `canViewForms`); `places` `/places` (if `canRequestLocations`); `help` `/help` (if `canRequestSurveys`); a last group titled `Modules` with one item per `MODULES` entry, `href: /modules/<feature>`, `locked: access[feature] === "locked"`.
  - `activeId`: flatten every item and child, pick the one whose `href` equals the path or is a prefix of it followed by `/`, longest wins; for `href === "/"` only an exact match counts; return `""` when none. When two items share an href (`reputation` and `cases`), prefer the **child** (iterate children after parents and use `>=` on length).
  - `teaserFor(feature, level)`: for `feature` in `MODULES` or `"reputation"` return `{ title: "<Label>", body, locked: level === "locked" }` where body for locked is `"This module is not part of your plan yet. Your data keeps flowing in, so it is ready the moment it is switched on. Ask the Atrium team about adding it."` and for unlocked is `"This module is on its way. You will find it here when it is ready."`; unknown feature → `null`.

- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** (`git add packages/ui/src/shell/nav.ts packages/ui/tests/nav.test.ts`).

---

### Task 3: `GET /api/access`

**Files:**
- Modify: `apps/api/src/cases.ts`
- Test: `apps/api/tests/access.test.ts` (create; copy the setup helpers of `apps/api/tests/onboarding-api.test.ts`)

**Interfaces:**
- Produces: `GET /api/access` → `{ access: Record<Feature, "full" | "basic" | "locked"> }`. Client scopes get `accessFor(tx, scope.clientId)`; agency and assigned scopes get every feature `"full"` (they run the product, nothing is locked for them).

- [ ] **Step 1: Failing test** — setup: an agency org, a client with an owner and `setPackage(tx, clientId, "essential", actor)`, plus an agency admin; tests:

```ts
test("a client sees the levels of its package", async () => {
  const body = (await (await call("owner", "GET", "/api/access")).json()) as any;
  expect(body.access).toMatchObject({ reputation: "locked", content: "full", discoverability: "basic" });
});
test("a package change shows up", async () => {
  await withAgency(db, (tx) => setPackage(tx, clientId, "pillar_2", seed));
  const body = (await (await call("owner", "GET", "/api/access")).json()) as any;
  expect(body.access.reputation).toBe("full");
});
test("the agency sees everything open", async () => {
  const body = (await (await call("admin", "GET", "/api/access")).json()) as any;
  expect(Object.values(body.access).every((l) => l === "full")).toBe(true);
});
test("signed out is refused", async () => {
  expect((await app.request("/api/access")).status).toBe(401);
});
```

- [ ] **Step 2: Run** — Expected: FAIL (404).
- [ ] **Step 3: Implement** in `cases.ts` after `/me`:

```ts
  api.get("/access", async (c) => {
    const scope = c.get("scope");
    if (scope.kind !== "client") {
      return c.json({ access: Object.fromEntries(FEATURES.map((f) => [f, "full"])) });
    }
    const access = await withScope(deps.db, scope, (tx) => accessFor(tx, scope.clientId));
    return c.json({ access });
  });
```

Import `accessFor` from `@atrium/core`; `FEATURES` from `@atrium/contracts` (the API already depends on it).
- [ ] **Step 4: Run** `bun test apps/api` — Expected: PASS.
- [ ] **Step 5: Commit** (`apps/api/src/cases.ts`, `apps/api/tests/access.test.ts`).

---

### Task 4: AppFrame, DashboardShell, Me context

**Files:**
- Create: `packages/ui/src/shell/me-context.tsx`, `packages/ui/src/shell/app-frame.tsx`, `packages/ui/tests/fake-api.ts`
- Modify: `packages/ui/src/api.ts` (`access()` call), `packages/ui/src/index.ts`
- Test: `packages/ui/tests/app-frame.test.tsx`

**Interfaces:**
- Produces:
  - `MeProvider({ me, children })` and `useMe(): Me` (throws outside a provider).
  - `AppFrame({ surface, pathname, linkAs, client?, children })` where `client` defaults to `api` and must provide `me()`, `access()`, `onboardingRequests()`, `places()`, `signOut()`.
  - `api.access(): Promise<Record<string, "full" | "basic" | "locked">>`.
  - Test helper `fakeFetch(routes: Record<string, unknown | (() => unknown)>)` that replaces `globalThis.fetch`, answering by exact path, 404 otherwise, and records calls.

- [ ] **Step 1: Failing tests** — `app-frame.test.tsx` with an injected client:

```tsx
const client = (over = {}) => ({
  me: async () => ownerMe,
  access: async () => ({ reputation: "full", content: "full", analytics: "full", discoverability: "full", retention: "locked", attribution: "basic", growth: "full", management: "full", benchmarks: "locked" }),
  onboardingRequests: async () => [],
  places: async () => [],
  signOut: mock(async () => undefined),
  ...over,
});

test("signed out shows the sign-in on any route", async () => {
  setup(<AppFrame surface="platform" pathname="/reputation/qr" client={client({ me: async () => { throw new ApiError(401, "unauthorized"); } })}>content</AppFrame>);
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
});

test("an owner gets the sidebar, the page and the account menu", async () => {
  setup(<AppFrame surface="platform" pathname="/reputation/feedback" client={client()}><p>the page</p></AppFrame>);
  expect(await screen.findByText("the page")).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Feedback" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: /Retention/ }).getAttribute("data-locked")).toBe("true");
  expect(screen.getByText(ownerMe.name)).toBeTruthy();
});

test("children read the person through useMe", async () => {
  const Who = () => <p>{useMe().role}</p>;
  setup(<AppFrame surface="platform" pathname="/" client={client()}><Who /></AppFrame>);
  expect(await screen.findByText("client_owner")).toBeTruthy();
});

test("the manager's approvals count is accounts plus pending places", async () => {
  setup(<AppFrame surface="manager" pathname="/" client={client({ me: async () => amMe, onboardingRequests: async () => [{ status: "open" }], places: async () => [{ status: "pending" }, { status: "active" }] })}>x</AppFrame>);
  const toggle = await screen.findByRole("button", { name: /Approvals/ });
  expect(within(toggle).getByText("2")).toBeTruthy();
});

test("the menu button opens a drawer that Escape closes", async () => {
  const { user } = setup(<AppFrame surface="platform" pathname="/" client={client()}>x</AppFrame>);
  const button = await screen.findByRole("button", { name: "Open menu" });
  await user.click(button);
  expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
});

test("sign out calls the client and reloads", async () => { /* click "Sign out"; expect client.signOut called */ });
```

(`ownerMe`/`amMe` are full `Me` objects built with the same helper as in `nav.test.ts`; put the helper in `tests/fake-api.ts`.)

- [ ] **Step 2: Run** — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.**
  - `me-context.tsx`: `createContext<Me | null>(null)`; `useMe` throws `new Error("useMe needs an AppFrame")` when null.
  - `api.ts`: `access: () => call<{ access: Record<string, "full" | "basic" | "locked"> }>("/api/access").then((r) => r.access)`.
  - `app-frame.tsx` (`"use client"`): state `me` (undefined loading / null signed out), `access`, `counts`. On mount `client.me()`; 401/403 → `null` (render `<SignIn surface={surface} />` full-page, exported from `cases-app.tsx`, which already exists); other errors → the existing "Cannot reach the server" banner. When `me` is set: if `surface === "platform"` load `client.access()` (failure → treat every module as `full` except reputation derived from `canReadSurveys`; do not crash); if `surface === "manager" && me.canManageLocations` load `onboardingRequests()` and `places()` and set `approvals = open accounts + pending places` (failures → 0). Build groups with `managerNav` or `platformNav`, `current = activeId(pathname, groups)`. Render:

```tsx
<MeProvider me={me}>
  <AppShell
    nav={<SideNav brand={<Wordmark size="sm" />} groups={groups} current={current} linkAs={linkAs} />}
    topBar={<TopBar start={<MenuButton onClick={() => setDrawer(true)} />} end={<AccountMenu me={me} onSignOut={signOut} />}>{null}</TopBar>}
  >
    {children}
  </AppShell>
  {drawer ? <Drawer onClose={() => setDrawer(false)}><SideNav ... /></Drawer> : null}
</MeProvider>
```

  - `MenuButton`: `<button aria-label="Open menu" className="lg:hidden …"><Menu size={20} /></button>` (lucide `Menu`).
  - `Drawer` (local component): `role="dialog" aria-modal="true" aria-label="Menu"`, fixed inset-0, backdrop `onClick` closes, panel holds the nav, `useEffect` adds a `keydown` listener closing on Escape and, on unmount, returns focus to the menu button (`ref.current?.focus()`); it is `lg:hidden`.
  - `AccountMenu`: name, role in words (`role.replaceAll("_", " ")`) and a "Sign out" button calling `onSignOut` (`client.signOut()` then `location.reload()`); no popover.
  - `Wordmark` comes from `./brand` (check its export path in `packages/ui/src/brand`).
  - Export `AppFrame`, `useMe`, `MeProvider`, `managerNav`, `platformNav` from `index.ts`.
- [ ] **Step 4: Run** `bun run --filter @atrium/ui test && bun run typecheck && bunx biome check packages` — Expected: PASS.
- [ ] **Step 5: Commit** the created and modified files.

---

### Task 5: Pages from existing screens, teaser and overview

**Files:**
- Modify: `packages/ui/src/cases-app.tsx`, `packages/ui/src/surveys-app.tsx`, `packages/ui/src/approvals-app.tsx`, `packages/ui/src/places-panel.tsx`, `packages/ui/src/index.ts`
- Create: `packages/ui/src/shell/teaser.tsx`, `packages/ui/src/shell/overview.tsx`
- Test: `packages/ui/tests/pages.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `teaserFor`, `api`.
- Produces page components (all take no required props and read `useMe()`; each renders its own `PageHeader` with eyebrow, title and description and **no** `SectionNav`, **no** `Account` block, **no** `SessionGate`):
  - `CasesPage({ surface })` ← the body of `Workspace` in `cases-app.tsx` (keep the status `Tabs`, the list/detail grid, the overdue banner, the polling).
  - `ResponsesPage` ← `Responses` in `surveys-app.tsx`; `FormsPage` ← `Forms` with `canManage={me.canManageSurveys}` and `canOperate={me.canOperateSurveys}`; `HelpRequestsPage` ← `Requests` (agency); `HelpPage` ← `HelpPanel` (client); `PlacesPage` ← `PlacesPanel`; `AccountsApprovalsPage` ← `Accounts`; `PlacesApprovalsPage` ← `Locations`; `ClientPlacesPage` ← `Locations`.
  - `ModulePage({ feature })`, `OverviewPage({ surface })`.
- `export` them from `index.ts` and delete the old whole-screen exports (`CasesApp`, `SurveysAdminApp`, `SurveysClientApp`, `ApprovalsApp`, `ApprovalsPanel`) once nothing imports them (Task 6 removes the last importers).

- [ ] **Step 1: Failing tests** — `pages.test.tsx` renders each page inside `MeProvider` with `fakeFetch`:

```tsx
test("the cases page lists cases and has no section links or account block", async () => {
  fakeFetch({ "/api/cases": { cases: [oneCase] } });
  setup(<MeProvider me={amMe}><CasesPage surface="manager" /></MeProvider>);
  expect(await screen.findByText(oneCase.locationName)).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
  expect(screen.queryByText("Sign out")).toBeNull();
});
test("the forms page gives an owner generate-link but not rotate", async () => { /* /api/surveys/forms with one active form; expect Generate link, no Rotate QR */ });
test("a locked module explains that it is not in the plan", () => {
  fakeFetch({ "/api/access": { access: { retention: "locked" } } });
  setup(<MeProvider me={ownerMe}><ModulePage feature="retention" /></MeProvider>);
  expect(await screen.findByText(/not part of your plan/i)).toBeTruthy();
});
test("the overview counts what the person can act on", async () => {
  fakeFetch({ "/api/cases": { cases: [open1, open2, overdue1] } });
  setup(<MeProvider me={ownerMe}><OverviewPage surface="platform" /></MeProvider>);
  expect(await screen.findByText("3")).toBeTruthy(); // open cases card
  expect(screen.getByRole("link", { name: /Open feedback/ }).getAttribute("href")).toBe("/reputation/feedback");
});
```

- [ ] **Step 2: Run** — Expected: FAIL (components missing).
- [ ] **Step 3: Implement** by mechanical extraction, in this order, keeping every behavior and test of the moved code:
  1. In `cases-app.tsx`: rename `Workspace` to `CasesPage({ surface })`; replace its `me` prop with `const me = useMe()`; delete the `SectionNav` block, the `actions=` prop of `PageHeader` and the now-unused `signOut`; leave `CasesApp`/`SignIn` in place until Task 6, and export `SignIn`, `CasesPage`.
  2. In `surveys-app.tsx`: for each of `Responses`, `Forms`, `Requests`, `HelpPanel` wrap the existing body in a function exported under the page name above and add `<PageHeader eyebrow="Reputation" title=… description=… />` at the top (titles: "Responses", "Forms & QR", "Help requests", "Ask for help"). `FormsPage` gets `canManage`/`canOperate` from `useMe()`. Keep `FormCard` exported and unchanged. Remove `SurveysAdminApp`, `SurveysClientApp`, `AdminWorkspace`, `ClientWorkspace`, `ClientTab`, `AdminTab` and the `Tabs`/`SectionNav`/`Account`/`SessionGate` imports they used.
  3. `places-panel.tsx`: add `PlacesPage()` = `PageHeader` ("My places") + `<PlacesPanel />`.
  4. `approvals-app.tsx`: export `AccountsApprovalsPage` (`PageHeader` "Accounts" + `<Accounts client={api} />`), `PlacesApprovalsPage` (+ `<Locations client={api} />`), `ClientPlacesPage` (same list under the title "Places"); remove `ApprovalsPanel`, `ApprovalsApp` and the tab count logic; the counts now live in the sidebar. Export `Accounts`/`Locations` only through these pages. Update `tests/approvals.test.tsx`: the panel-level tests (tab selection, counts) are replaced by page-level tests that render `AccountsApprovalsPage`/`PlacesApprovalsPage` with `fakeFetch`; keep the approve/reject/pause/reason/error assertions as they are.
  5. `teaser.tsx`: `ModulePage({ feature })` loads `api.access()` (platform) and renders `PageHeader` + a `Card` with `teaserFor(feature, level)`; unknown feature → `EmptyState` "No such module". For the agency (`me.kind !== "client"`) show the same unlocked copy.
  6. `overview.tsx`: `OverviewPage({ surface })` loads `api.cases()` (and, for the Manager with `canManageLocations`, `api.onboardingRequests()` and `api.places()`); renders cards (use `Card`, big number, label, a `Link`-styled anchor): Platform → "Open cases" (count of cases not resolved) linking `/reputation/feedback`, "Past the 24-hour target" (overdue) linking the same, and when `canReadSurveys` "Latest answers" linking `/reputation/responses`; Manager → "Cases past the target", "Open cases" (`/reputation/cases`), "Accounts waiting" (`/approvals/accounts`), "Places waiting" (`/approvals/places`). Counts use `dueLabel`/`inTab` from `./format`. A one-line note under the title: "A fuller overview arrives with Host." is **not** shown; no placeholder copy.
- [ ] **Step 4: Run** `bun run --filter @atrium/ui test && bun run typecheck && bunx biome check packages` — Expected: PASS. (`index.ts` may still export old names until Task 6; keep typecheck green by leaving them in place until then.)
- [ ] **Step 5: Commit** the files named above.

---

### Task 6: Wire the apps (routes, frame, redirects)

**Files:**
- Move (with `git mv`): Manager `app/page.tsx`, `app/surveys/`, `app/approvals/`; Platform `app/page.tsx`, `app/surveys/` into `app/(app)/…`; leave `app/layout.tsx`, `app/globals.css` and Platform `app/set-password/` in place.
- Create per app: `app/(app)/layout.tsx`, `app/(app)/frame.tsx`, and the route files below.
- Modify: each app's `next.config.ts` (redirects), `packages/ui/src/index.ts` (drop old exports), `packages/ui/src/cases-app.tsx` (drop `CasesApp`, keep `SignIn`).

**Interfaces:**
- `frame.tsx` in each app:

```tsx
"use client";
import { AppFrame } from "@atrium/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Frame({ children }: { children: ReactNode }) {
  return (
    <AppFrame surface="manager" pathname={usePathname()} linkAs={Link}>
      {children}
    </AppFrame>
  );
}
```

(`surface="platform"` in Platform.) `app/(app)/layout.tsx`: `import { Frame } from "./frame"; export default function Layout({ children }) { return <Frame>{children}</Frame>; }`.

- Routes (each file `export default function Page() { return <X />; }` importing from `@atrium/ui`):
  - Manager: `(app)/page.tsx` → `OverviewPage surface="manager"`; `(app)/reputation/cases/page.tsx` → `CasesPage surface="manager"`; `reputation/responses` → `ResponsesPage`; `reputation/forms` → `FormsPage`; `reputation/help` → `HelpRequestsPage`; `approvals/accounts` → `AccountsApprovalsPage`; `approvals/places` → `PlacesApprovalsPage`; `clients/places` → `ClientPlacesPage`.
  - Platform: `(app)/page.tsx` → `OverviewPage surface="platform"`; `reputation/feedback` → `CasesPage surface="platform"`; `reputation/responses` → `ResponsesPage`; `reputation/qr` → `FormsPage`; `places` → `PlacesPage`; `help` → `HelpPage`; `modules/[feature]/page.tsx` → `async function Page({ params }) { const { feature } = await params; return <ModulePage feature={feature} />; }`.
- Redirects in `next.config.ts`: `async redirects() { return [ ... ] }` with `permanent: false`: Manager `/surveys` → `/reputation/responses`, `/approvals` → `/approvals/accounts`; Platform `/surveys` → `/reputation/responses`. Remove the old `app/surveys` and `app/approvals` page files after moving their routes.

- [ ] **Step 1: Failing check** — there is no unit test for Next routing; the failing signal is the build: run `bun run --filter @atrium/manager build` is too slow, so use `bun run typecheck` and `curl` against the dev servers after the change. Before moving anything, record the current status of `curl -s -o /dev/null -w '%{http_code}' localhost:3002/reputation/cases` (expected `404`).
- [ ] **Step 2: Move and create** the files as above with `git mv` for the moves so history follows.
- [ ] **Step 3: Remove** the old exports (`CasesApp`, and any export from `index.ts` that no file imports) and run `bun run typecheck && bunx biome check apps packages && bun run check:deps`.
- [ ] **Step 4: Verify** with the dev servers running (restart them if needed; `next dev` picks up new route groups on reload): every route above returns 200 with `curl`, the two redirects return 307 to the new paths, and `/set-password` and the Hub pages are unchanged.
- [ ] **Step 5: Commit** (`git add` the new and moved paths explicitly).

---

### Task 7: Verify in the browser and CI

- [ ] **Step 1:** `set -a && . ./.env.local && set +a && bun run ci` — Expected: PASS. Report failures that live outside this plan instead of fixing them.
- [ ] **Step 2: Browser check** with the Chrome DevTools tools, signing in as `demo-am@demo.test` on `localhost:3002` and `demo-owner@demo.test` on `localhost:3003` (password `demo-password-1`): at 1280px wide the sidebar shows, submenus open and close, the current item is highlighted on deep links (`/reputation/forms`), locked modules show the lock and open a teaser, Approvals shows its count, and a deep link while signed out shows the sign-in. At 390px wide the sidebar is hidden, "Open menu" opens the drawer and Escape closes it, and no page scrolls horizontally. Take one screenshot per app at each width and look at them.
- [ ] **Step 3: Report** anything not run, with the reason.

---

## Self-review notes

- Spec coverage (phase 1): submenus and locked items (T1), nav configs and teasers (T2), `GET /api/access` (T3), shell with drawer, account menu and sign-in on deep links (T4), every tab as a page plus overview and teaser (T5), routes, redirects and route groups (T6), responsive and visual check (T7). Phase 2 items (overview KPIs, Host pages, agents, activity) are intentionally absent, and the menu carries no Host entry.
- The place switcher in the top bar is deferred to phase 2 with the data it needs (spec lists it under the shell; a one-place client does not need it and a multi-place switcher has no page that filters by place yet).
