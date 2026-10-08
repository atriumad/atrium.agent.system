# Dashboard shell, navigation and role-shaped data (UI phase 1 and 2)

Date: 2026-10-08 · Status: draft for review

## Why

Manager and Platform are single pages with text links on top and tabs inside. They read as a form,
not as the product. The product is one system: the agency runs a portfolio, the client runs a
business with an agentic assistant (Host first, more modules later). Both need a traditional
dashboard: a sidebar with a main menu and submenus, a top bar, and one page per section.

## Decisions (agreed in the working session)

- ADR 0016 stands: **two apps, one API, one data model**. Platform (client) and Manager (agency)
  share one shell and one component library in `@atrium/ui`; each builds its own menu from the
  signed-in person's role and, for clients, their package.
- Modules the client's package does not include stay **visible, locked, with a teaser** (ADR 0016).
  Nothing is hidden by role inside a module the person can open; sections the *role* may not use
  (for example forms for a location manager) are left out of the menu.
- Focus now: Reputation and **Host** (the agent). The structure must take new modules without
  rework: adding one is adding an entry to a config, not new layout code.
- The Hub (guest survey, request access) stays public and has no sidebar.
- Mobile (Expo) is out of scope here.

## Which data matters to whom

| | Client (Platform) | Agency (Manager) |
|---|---|---|
| Question | "How is my business doing, and what did Host do for me?" | "What does my portfolio need from a person, and what is failing?" |
| Overview | Average rating, 30-day trend, new answers, review-link clicks, cases waiting on me | Overdue cases across clients, approvals waiting, places to activate, agents switched off |
| Host | What it did (requests sent, cases opened), what waits for my approval | Agent health, autonomy level per client, kill switch, errors |
| Cases | My cases per place with the 24h target | All clients, by account manager, overdue first |
| Configuration | My places, QR, send delay | Packages and access, Google link, rotate QR |
| Audit | Plain-language list of what Host did | Full record of every agent action |

Rule for builders: a screen is written for one audience. If both need the same fact, each gets its
own query shaped for its question; the agency view never leaks into the client app's code.

## Information architecture

### Platform (client)

| Main menu | Submenu |
|---|---|
| Overview | (single page) |
| Reputation | Feedback (cases) · Responses · QR & links *(needs `survey:forms`)* |
| Host | Activity · Approvals *(phase 2)* |
| My places | (single page) |
| Help | (single page, `survey:request`) |
| Locked modules, from the package | Content · Analytics · Discoverability · Retention · Attribution · Growth · Management · Benchmarks, each locked or basic/full per `ACCESS_MATRIX`; a locked one opens a teaser page |

### Manager (agency)

| Main menu | Submenu |
|---|---|
| Overview | (single page) |
| Reputation | Cases · Responses · Forms & QR · Help requests |
| Host | Agents · Activity *(phase 2)* |
| Approvals `(n)` | Accounts · Places |
| Clients | Places *(all locations and status)* |

Items appear only when the role's permissions allow them (`can(role, resource, action)`), the
same source the API enforces. The count badge on Approvals is open accounts plus pending places.

## Routes (each current tab becomes a page)

Platform: `/` overview · `/reputation/feedback` · `/reputation/responses` · `/reputation/qr` ·
`/host/activity` · `/places` · `/help` · `/modules/[feature]` (teaser).
Manager: `/` overview · `/reputation/cases` · `/reputation/responses` · `/reputation/forms` ·
`/reputation/help` · `/approvals/accounts` · `/approvals/places` · `/clients/places` ·
`/host/agents` · `/host/activity`.
Old URLs (`/surveys`, `/approvals`) redirect to the new ones. Case detail keeps working as it does
today inside Cases.

## The shell (`packages/ui`)

- `DashboardShell` composes the existing `AppShell`, `SideNav` and `TopBar`. New pieces:
  - `SideNav` groups gain **submenus**: an item can have `children`; the parent shows a chevron,
    expands on click, stays open when a child is current, and marks the parent current too.
    Keyboard: arrow keys move between items, Enter/Space toggles, `aria-expanded` and
    `aria-current="page"` set correctly.
  - `locked` items render dimmed with a lock icon and route to the teaser page; they are not
    disabled links.
  - Below `lg`, the sidebar is a drawer opened from a menu button in the top bar.
  - The top bar holds the page title area, a place switcher on Platform when the client has more
    than one place, and the account menu (name, role, sign out).
- A navigation **config** per app (`manager-nav.ts`, `platform-nav.ts`) is a pure function from
  `Me` (and, for Platform, the access levels) to `SideNavGroup[]`. It has unit tests.
- `Me` gains what the menu needs: `access` (feature → level, for client scopes). New route
  `GET /api/access` returns it from `accessFor`.
- Existing `SectionNav` and tab groups inside pages are removed; filters that remain (for example
  "low ratings only") stay as in-page controls.

## Phase 1: shell and restructure (no new data)

Build the shell, the two nav configs, the routes above with the current content moved page by page,
the teaser page, redirects and responsive behavior. No new API data except `GET /api/access`.

## Phase 2: role-shaped data

- `GET /api/overview` returns a payload shaped by the caller: client scope gets rating average and
  30-day trend (per day), answers in the last 7 days, review-link clicks, open and overdue own cases;
  agency/assigned scope gets overdue and open cases by client, pending approvals and places,
  switched-off agents, and the five worst-rated places this week. Everything is computed from tables
  that already exist (`survey_responses`, `recovery_cases`, `review_requests`, `kill_switches`,
  `approval_requests`, `locations`), through RLS.
- `GET /api/host/activity` returns audit entries rewritten for people (agent, action in plain words,
  place, outcome, when); the client sees its own, the agency sees the full record with agent version
  and decision. Paged with `before`.
- `GET /api/host/agents` (agency only) lists each agent per client with autonomy level and kill
  switch state.
- Approvals for the client (`level 3` proposals) are listed and decided by the owner with the
  existing `listPendingApprovals` and `decideApproval`.

Charts: one small trend line and number cards only; no chart library beyond what `@atrium/ui`
already ships (check before adding one).

## Testing

- Nav configs: for every role and package, the exact menu (table-driven), including locked items and
  the location manager's reduced menu.
- `SideNav`: expanding, current parent, keyboard, locked item, drawer on small screens.
- Routes: each page renders for an allowed role and shows a clear message for a forbidden one.
- API: `/api/access` per package; overview shaped per scope (client never receives other clients'
  numbers); host activity paging and per-audience fields.
- Visual check in the browser at desktop and phone width for both apps before calling a phase done.

## Risks

- Moving every tab to a route touches most UI code: phase 1 keeps behavior identical and the
  existing component tests green, so regressions are caught.
- `ACCESS_MATRIX` tiers for `growth`, `management` and `benchmarks` are marked "to confirm" in Core;
  teasers must not promise what is not decided, so their copy stays generic.
- Overview numbers must match what the detail pages show; each card links to the page that lists the
  same rows.
