# Overview and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Manager and Platform Overview pages with page-per-audience dashboards (figures with change and trend, a trend chart, a ranked topic split, a queue and a clients/places table), backed by two read-only aggregate API routes.

**Architecture:** Pure aggregation functions in `modules/reputation/domain/insights.ts` do all windowing, time-zone day bucketing, small-sample rules and medians. `modules/reputation/application/insights.ts` runs two bounded selects through the caller's `Tx` (row-level security decides the tenancy) and hands the rows to those functions. `apps/api/src/insights.ts` adds the role check, composes the core pieces the agency queue needs (approvals, onboarding, pending places), and mounts `GET /api/insights/owner` and `GET /api/insights/agency`. `@atrium/ui` gets shared pieces (range/place state in the address, `PageControls`, `KpiTile`, `TrendChart`, `SplitBars`) and two new page components.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle (Postgres), React 19 + Tailwind v4 + Base UI, `bun test` with Testing Library, Docusaurus (EN/ES docs).

**Spec:** `docs/superpowers/specs/2026-10-17-overview-analytics-design.md` (and the style in `docs/superpowers/specs/2026-10-16-ui-foundations-design.md`, section "Revision").

## Global Constraints

- Branch `feat/ui-foundations`, worktree `/Users/ventura/Desktop/d/atrium/atrium.ui`. One commit per task, message in English, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Module boundaries (`bun run check:deps`): `modules/reputation` may import only `@atrium/core` (public API), `@atrium/contracts`, `@atrium/scoring` and itself. `domain/` imports only `domain/`, contracts and scoring. Anything that needs approvals, onboarding or locations from core goes in `apps/api`.
- Ranges are `7d`, `30d`, `90d` only; default `30d`. Each is compared with the immediately preceding window of the same number of local days.
- Small-sample rule, one shared constant `MIN_SAMPLE = 10`: a trend or a delta needs at least 10 answers in the window, and a delta at least 10 in the previous window too. Below that: "Too few answers (n)" in tiles and "—" in tables.
- Days are each place's own local calendar days (`core.locations.time_zone`). An "all places" series sums by local date string. "Updated" is shown in the viewer's browser time zone.
- Definitions (use these words and no others in code and docs):
  - Average rating: mean of `rating` over answers in the window. Portfolio rating: mean over all answers, never a mean of client means.
  - Change: this window minus the previous window; `null` below the small-sample rule. Rating change is in rating points; rate changes are in percentage points; counts change in percent.
  - Answer rate: answers whose `invitation_id` equals a `review_requests.invitation_id` where `status = 'sent'` and `sent_at` is in the window, divided by review requests with `status = 'sent'` and `sent_at` in the window.
  - Review click rate: answers with `review_clicked_at` set, divided by answers.
  - Time to contact: `contacted_at - opened_at` for cases opened in the window, as a median; share inside target is cases with `contacted_at <= due_at`.
  - Overdue: `status = 'open'` and `due_at` passed. Due: `status = 'open'`, not overdue, `due_at` within the next 24 hours.
  - Sentiment of a topic: sentiment of the answers that mention the topic (an answer has one sentiment and many topics). `positive` and `negative` as stored; every other value, including `mixed`, counts as neutral.
- Style: the product theme from the UI foundations spec. Cream page and cards, `border-frame` outline, no shadow on content, lime only for the one primary action and the one "waiting on you" tile wash, clay for what is wrong, status never by colour alone. Every chart has a text alternative.
- Routes: `GET /api/insights/owner?range=&place=` needs `scope.kind === "client"`; `GET /api/insights/agency?range=&client=` needs `scope.kind` of `"agency"` or `"assigned"`. The other kind gets 403. An unknown `range` gets 422 `{error: "invalid_range"}`; a `place` or `client` that is not a UUID gets 422 `{error: "invalid_id"}`; one outside the person's scope returns an empty result as if it had no data (RLS hides it), never 403.
- Copy is English in code. Docs are EN and ES.

## Review Focus

1. A place with an unknown or odd time zone string: bucketing must fall back to UTC rather than throw (Task 1).
2. A window with zero answers, one answer, or exactly 10 answers: no division by zero, no `NaN` in JSON, the small-sample boundary is `>= 10` (Task 1, Task 2).
3. Two clients in one agency: the owner route of client A never contains client B's places or answers; an `assigned` account manager sees only assigned clients (Task 4).
4. An answer created at 23:30 local time on the last day of a window, in a zone far from UTC, lands on the right local day and in the right window (Task 1).
5. Sentiment reading absent for every answer in the window: the topic block gets an empty list and a `read` count of 0, and the page says "No reading yet" (Task 2, Task 8).

## File Structure

| File | Responsibility |
| --- | --- |
| `modules/reputation/domain/insights.ts` (create) | Pure: ranges, windows, local dates, small-sample rule, comparisons, median, series, topic split, client status. |
| `modules/reputation/application/insights.ts` (create) | `ownerInsights`, `agencyInsights`: bounded selects through `Tx`, then the pure functions. |
| `modules/reputation/index.ts` (modify) | Export the two functions and their types. |
| `modules/core/application/lookups.ts` (modify) | Add `timeZone` to the location labels. |
| `apps/api/src/insights.ts` (create) | `mountInsights(api, deps)`: role check, query parsing, the agency queue (core pieces), JSON shaping. |
| `apps/api/src/cases.ts` (modify) | Mount `mountInsights`. |
| `packages/ui/src/api.ts` (modify) | Response types and `api.insightsOwner`, `api.insightsAgency`. |
| `packages/ui/src/data/use-range-state.ts` (create) | Range, place and client in the address. |
| `packages/ui/src/data/page-controls.tsx` (create) | Segmented range control, select, updated stamp. |
| `packages/ui/src/data/kpi-tile.tsx` (create) | Figure + change + trend + note, with too-few and no-data states. |
| `packages/ui/src/data/delta.tsx` (modify) | `unit` prop (`"%"` or `"pts"`), for points. |
| `packages/ui/src/data/trend-chart.tsx` (create) | Daily line with volume bars and a text alternative. |
| `packages/ui/src/data/split-bars.tsx` (create) | Ranked stacked sentiment bars. |
| `packages/ui/src/shell/overview.tsx` (modify) | `OverviewPage` chooses `OwnerOverview` or `AgencyOverview` by `surface`. |
| `packages/ui/src/shell/overview-owner.tsx`, `overview-agency.tsx` (create) | The two pages. |
| `apps/worker/scripts/seed-history.ts` (create), `package.json` (modify) | `bun run seed:history`. |
| `apps/docs/docs/guides/reading-the-overview.md` + ES (create), guides index EN/ES (modify) | Definitions and how to read the pages. |

---

### Task 1: The pure aggregation functions

**Files:**
- Create: `modules/reputation/domain/insights.ts`
- Test: `modules/reputation/tests/insights-domain.test.ts`

**Interfaces:**
- Produces (all exported from `domain/insights.ts`):
  - `type Range = "7d" | "30d" | "90d"`; `RANGE_DAYS: Record<Range, number>`; `MIN_SAMPLE = 10`; `parseRange(value: string | undefined): Range | null` (undefined gives `"30d"`, anything unknown gives `null`).
  - `localDate(at: Date, timeZone: string): string` (`YYYY-MM-DD`; invalid zone falls back to `"UTC"`).
  - `windowDates(now: Date, timeZone: string, days: number): { current: string[]; previous: string[] }` (ascending, `days` entries each, `current` ends on the local date of `now`).
  - `type AnswerRow = { locationId: string; createdAt: Date; rating: number; sentiment: string | null; topics: string[] | null; readAt: Date | null; reviewClickedAt: Date | null; invitationId: string | null }`.
  - `type PlaceZone = { id: string; timeZone: string }`.
  - `type Compared = { value: number | null; change: number | null; n: number; nPrevious: number; small: boolean }`.
  - `compareMean(current: number[], previous: number[]): Compared` and `compareCount(current: number, previous: number): Compared` (percent change; small when `current < MIN_SAMPLE`) and `compareRate(cur: {num: number; den: number}, prev: {num: number; den: number}): Compared` (percentage points).
  - `median(values: number[]): number | null`.
  - `dailySeries(rows: AnswerRow[], zones: PlaceZone[], now: Date, days: number): { date: string; average: number | null; count: number }[]` (one entry per local date of the current window, zero-count days have `average: null`).
  - `splitByTopic(rows: AnswerRow[], limit: number): { topic: string; total: number; positive: number; neutral: number; negative: number }[]` (rows without `sentiment` or `topics` are skipped; sorted by `total` desc, then topic).
  - `type ClientStatus = "needs_a_person" | "approvals_waiting" | "setting_up" | "healthy"`; `clientStatus(input: { overdue: number; approvals: number; pendingPlaces: number }): ClientStatus` (order of precedence as listed).
  - `weightedMean(parts: { sum: number; n: number }[]): number | null`.

- [ ] **Step 1: Write the failing tests** in `insights-domain.test.ts`, with these named tests and assertions:
  - `parseRange`: `undefined` is `"30d"`, `"7d"` is `"7d"`, `"1y"` is `null`.
  - `localDate`: `new Date("2026-10-18T03:30:00Z")` in `"America/Chicago"` is `"2026-10-17"`; in `"Asia/Tokyo"` is `"2026-10-18"`; in `"Not/AZone"` is `"2026-10-18"` (UTC fallback).
  - `windowDates`: for `now = 2026-10-17T12:00Z`, `"UTC"`, `7`: `current` has 7 entries, last is `"2026-10-17"`, first `"2026-10-11"`; `previous` last is `"2026-10-10"`.
  - `compareMean`: current of 12 ratings averaging 4.2 against previous of 11 averaging 4.0 gives `value` 4.2 and `change` 0.2 (within 1e-9), `small` false; current of 9 values gives `small` true and `change` null; previous of 9 values gives `change` null.
  - Boundary: exactly 10 current and 10 previous is not small; 10 current and 9 previous has `change` null.
  - `compareCount(130, 100)` has `change` 30; `compareCount(5, 0)` has `change` null.
  - `compareRate({num: 40, den: 100}, {num: 45, den: 100})` has `value` 0.4 and `change` -5 (points); a zero denominator gives `value` null and `change` null.
  - `median([3, 1, 2])` is 2; `median([4, 1, 2, 3])` is 2.5; `median([])` is `null`.
  - `dailySeries`: an answer at `2026-10-17T04:30:00Z` for a place in `"America/Chicago"` is counted on `"2026-10-16"`, not on the 17th; an answer 91 days back is excluded from a 90-day series; a day with no answers has `average: null` and `count: 0`; the output has no `NaN`.
  - `splitByTopic`: two answers on `wait-time` (one `negative`, one `mixed`) and one on `food` (`positive`) give `wait-time` `{total: 2, negative: 1, neutral: 1, positive: 0}` first; an answer with `sentiment: null` is skipped; `limit` 1 returns one row.
  - `clientStatus`: `{overdue: 1, approvals: 2, pendingPlaces: 0}` is `"needs_a_person"`; `{0, 2, 0}` is `"approvals_waiting"`; `{0, 0, 1}` is `"setting_up"`; `{0, 0, 0}` is `"healthy"`.
  - `weightedMean([{sum: 8, n: 2}, {sum: 12, n: 3}])` is 4; `weightedMean([])` is `null`.

- [ ] **Step 2: Run to verify failure.** Run: `cd modules/reputation && bun test tests/insights-domain.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** the signatures above in `domain/insights.ts`. Use `Intl.DateTimeFormat("en-CA", { timeZone, ... })` for `localDate` inside a try/catch that retries with `"UTC"`. Keep it free of imports other than types.

- [ ] **Step 4: Run to verify pass.** Same command. Expected: all PASS.

- [ ] **Step 5: Commit** `feat(reputation): pure aggregation for the overview, windows, small samples, medians`.

---

### Task 2: Owner aggregation through the transaction

**Files:**
- Modify: `modules/core/application/lookups.ts` (add `timeZone: string` to `LocationLabel` and select `locations.timeZone` in `describeLocations` and `listLocationLabels`), `modules/core/index.ts` if the type needs re-exporting.
- Create: `modules/reputation/application/insights.ts`
- Modify: `modules/reputation/index.ts`
- Test: `modules/reputation/tests/insights.test.ts`

**Interfaces:**
- Consumes: Task 1 functions; `listLocationLabels(tx): Promise<(LocationLabel & { id: string })[]>` from `@atrium/core`; tables `surveyResponses`, `recoveryCases`, `reviewRequests` from `../infra/schema`.
- Produces:
  - `type Tile = { value: number | null; change: number | null; n: number; small: boolean; spark: number[] }`.
  - `type OwnerInsights = { range: Range; generatedAt: string; window: { from: string; to: string }; rating: Tile; responses: Tile & { answerRate: number | null; sent: number }; reviewClicks: { clicks: number; answers: number; rate: number | null; change: number | null; small: boolean }; waiting: { open: number; overdue: number }; series: { date: string; average: number | null; count: number }[]; topics: { topic: string; total: number; positive: number; neutral: number; negative: number }[]; read: number; places: { locationId: string; name: string; rating: number | null; change: number | null; responses: number; openCases: number; overdueCases: number }[]; host: { requestsSent: number; casesOpened: number; answersRead: number } }`.
  - `ownerInsights(tx: Tx, input: { range: Range; locationId?: string | undefined; now: Date }): Promise<OwnerInsights>`.

- [ ] **Step 1: Write failing tests** in `insights.test.ts` (use the harness pattern of `modules/reputation/tests/flow.test.ts`: create a client, two locations in different zones, insert `survey_responses`, `recovery_cases`, `review_requests` through the admin connection, then call `ownerInsights` inside `withTenant`):
  - Twelve answers in the window and eleven in the previous one: `rating.change` equals the difference of means, `rating.small` false, `series` has exactly `RANGE_DAYS[range]` entries.
  - Nine answers: `rating.small` true, `rating.change` null, and the JSON-serialised result contains no `NaN` or `null` in `series[].count`.
  - Zero answers: every field is present, `rating.value` null, `topics` `[]`, `read` 0.
  - `locationId` filter: only that place's answers count and `places` has one entry.
  - Answer rate: 4 sent requests in the window of which 2 have an invitation that an answer used gives `responses.answerRate` 0.5 and `responses.sent` 4; a `scheduled` or `skipped` request is not counted.
  - Review clicks: 3 of 12 answers with `review_clicked_at` give `reviewClicks.rate` 0.25.
  - `waiting`: one open case past `due_at` and one open case due in 3 hours give `{open: 2, overdue: 1}`; a `contacted` case is not counted.
  - `host.casesOpened` counts cases with `opened_at` in the window; `host.answersRead` counts answers with `read_at` in the window; `topics` and `read` ignore answers with null `sentiment`.
  - Places are sorted overdue cases desc, then lowest rating first, and a place with fewer than 10 answers has `rating` null and `change` null (`small` rule).

- [ ] **Step 2: Run to verify failure.** Run: `cd modules/reputation && bun test tests/insights.test.ts`. Expected: FAIL, `ownerInsights` not exported. (Needs Postgres up: `docker compose up -d postgres`, then `bun run db:migrate` at the repo root.)

- [ ] **Step 3: Implement `ownerInsights`.** Approach: read the places with `listLocationLabels(tx)` (RLS already limits them), optionally narrowed to `locationId`; select answers with `createdAt >= now - (2 * days + 2) days` and `locationId in (...)`, selecting only the `AnswerRow` columns; select cases opened or open in the window and review requests sent in the window; then compute everything with the Task 1 functions, bucketing each answer by its place's zone. Do not filter by client in SQL (row-level security does that). Round nothing; the UI formats.

- [ ] **Step 4: Run to verify pass.** Same command. Expected: PASS.

- [ ] **Step 5: Export** `ownerInsights`, `OwnerInsights`, `Tile` and the Task 1 `Range`, `parseRange`, `RANGE_DAYS` from `modules/reputation/index.ts`. Run `bun run check:deps` and `bun run typecheck`. Expected: clean.

- [ ] **Step 6: Commit** `feat(reputation): the owner's insights, read through the caller's transaction`.

---

### Task 3: Agency aggregation

**Files:**
- Modify: `modules/reputation/application/insights.ts`, `modules/reputation/index.ts`
- Test: `modules/reputation/tests/insights-agency.test.ts`

**Interfaces:**
- Consumes: Task 1 and 2 pieces.
- Produces:
  - `type AgencyInsights = { range: Range; generatedAt: string; window: { from: string; to: string }; contact: { medianHours: number | null; insideTarget: number | null; cases: number; change: number | null; small: boolean }; overdue: { value: number; previous: number }; portfolio: Tile; answerRate: { value: number | null; change: number | null; sent: number; answered: number; small: boolean }; clients: { clientId: string; name: string; places: number; rating: number | null; change: number | null; spark: number[]; responses: number; answerRate: number | null; overdue: number; pendingPlaces: number }[]; cases: { id: string; clientId: string; clientName: string; locationName: string; severity: string; summary: string; dueAt: string; overdue: boolean }[] }`. `cases` is open cases that are overdue or due, overdue first, then by `dueAt`, at most 50. `summary` is the first 120 characters of the answer's `comment`, or `"{rating}-star answer"` if there is none.
  - `agencyInsights(tx: Tx, input: { range: Range; clientId?: string | undefined; now: Date }): Promise<AgencyInsights>`.

- [ ] **Step 1: Write failing tests** (two clients, three places, an agency `Tx` through `withAgency`):
  - `portfolio.value` is the mean over all answers, not the mean of the two clients' means (client A 4.0 over 10 answers, client B 5.0 over 30 answers gives 4.75).
  - `contact.medianHours` for cases contacted after 2h, 6h and 10h is 6; `insideTarget` is the share with `contacted_at <= due_at`; a case still open before `due_at` does not count as outside target; a case open past `due_at` does.
  - `clients` rows: a client with fewer than 10 answers has `rating`, `change` null and `spark` `[]`; `overdue` and `pendingPlaces` (locations with `status = 'pending'`) are counted per client; `places` is the client's location count.
  - `clientId` filter narrows `clients`, `cases` and the tiles.
  - `cases` lists the overdue case before the one due in 20 hours, and skips contacted and resolved ones.
  - Zero data gives empty arrays and `null` values, never `NaN`.

- [ ] **Step 2: Run to verify failure.** `cd modules/reputation && bun test tests/insights-agency.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `agencyInsights`** reusing the selects and pure functions of Task 2; group by `clientId` with the labels from `listLocationLabels`. Extract any helper both functions need into the same file; do not duplicate the select code.

- [ ] **Step 4: Run to verify pass.** Expected: PASS.

- [ ] **Step 5: Export** `agencyInsights` and `AgencyInsights`; run `bun run check:deps` and `bun run typecheck`.

- [ ] **Step 6: Commit** `feat(reputation): the agency's insights, clients, contact time and the cases that need a person`.

---

### Task 4: The two API routes and the agency queue

**Files:**
- Create: `apps/api/src/insights.ts`
- Modify: `apps/api/src/cases.ts` (call `mountInsights(api, deps)` next to `mountNotifications`)
- Test: `apps/api/tests/insights.test.ts`

**Interfaces:**
- Consumes: `ownerInsights`, `agencyInsights`, `parseRange` from `@atrium/reputation`; from `@atrium/core`: `withScope`, `can`, `listPendingApprovals(tx, scope)` (check its exact signature in `modules/core/application/approvals.ts` and use it as is), `listOnboardingRequests(tx, scope)`, `listLocationLabels(tx)`.
- Produces: `mountInsights(app: Hono<{ Variables: { scope: Scope; userName: string } }>, deps: AppDeps): void`. Routes:
  - `GET /insights/owner` returns `OwnerInsights`.
  - `GET /insights/agency` returns `AgencyInsights & { queue: QueueItem[]; queueCounts: { cases: number; approvals: number; accounts: number; places: number } }`, with `type QueueItem = { kind: "case" | "approval" | "account" | "place"; id: string; client: string; place: string | null; detail: string; severity: string | null; dueAt: string | null; overdue: boolean; href: string }`. `href` is `/reputation/cases?case={id}`, `/approvals/places`, `/approvals/accounts`, `/approvals/places` as appropriate (verify against the Manager's existing routes and the `notificationHref` targets). Accounts are included only if `can(scope.role, "location", "manage")`. The queue is cases first (overdue first, then by due time), then approvals, accounts and places, capped at 8, while `queueCounts` carries the full counts.

- [ ] **Step 1: Write failing API tests** (follow `apps/api/tests/cases.test.ts`: agency organization, two clients each with an owner, an assigned account manager, sessions through Better Auth):
  - Owner route as client A's owner: 200, and no place, answer count or client name of client B appears anywhere in the JSON.
  - Owner route as an agency session: 403. Agency route as a client session: 403.
  - Agency route as an account manager assigned only to client A: `clients` has A and not B; as an unassigned agency role with full scope: both.
  - `?range=1y` is 422 `invalid_range`; `?place=not-a-uuid` is 422 `invalid_id`; `?place=` of a place of another client returns 200 with empty `places` and zero counts.
  - Queue: an overdue case is first, a pending approval and a pending place follow, `queueCounts` carries totals larger than 8 when seeded with 10 cases while `queue.length` is 8, and a role without `location:manage` gets no `account` items.
  - No session is 401 on both routes.

- [ ] **Step 2: Run to verify failure.** `cd apps/api && bun test tests/insights.test.ts`. Expected: FAIL, routes 404.

- [ ] **Step 3: Implement `mountInsights`.** One `withScope` per request. Validate the query before touching the database. `now` comes from `deps.now?.() ?? new Date()`. Serialise `Date` values as ISO strings. Mount it in `cases.ts` after `mountNotifications(api, deps)`.

- [ ] **Step 4: Run to verify pass.** Expected: PASS. Then `bun run check:deps && bun run typecheck` at the root.

- [ ] **Step 5: Commit** `feat(api): insights routes for the owner and the agency, with the queue`.

---

### Task 5: The UI's API client

**Files:**
- Modify: `packages/ui/src/api.ts`, `packages/ui/tests/fake-api.ts`
- Test: `packages/ui/tests/insights-api.test.ts`

**Interfaces:**
- Produces in `api.ts`: types `RangeKey = "7d" | "30d" | "90d"`, `Tile`, `OwnerInsights`, `AgencyInsights`, `QueueItem`, `AgencyOverview = AgencyInsights & { queue: QueueItem[]; queueCounts: {...} }` mirroring Tasks 2 to 4 exactly (dates as `string`), and `api.insightsOwner(range: RangeKey, place?: string): Promise<OwnerInsights>`, `api.insightsAgency(range: RangeKey, client?: string): Promise<AgencyOverview>`. In `fake-api.ts` export `ownerInsightsFixture` and `agencyInsightsFixture` (complete objects, 12 answers, one overdue case) for the page tests.

- [ ] **Step 1: Write the failing test:** `insightsOwner("7d", "p1")` calls `/api/insights/owner?range=7d&place=p1`; `insightsOwner("30d")` calls `/api/insights/owner?range=30d`; `insightsAgency("90d", "c1")` calls `/api/insights/agency?range=90d&client=c1`.
- [ ] **Step 2: Run to verify failure.** `cd packages/ui && bun test tests/insights-api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the types and the two methods next to `cases`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `feat(ui): the client for the insights routes`.

---

### Task 6: Range state, controls, the figure tile

**Files:**
- Create: `packages/ui/src/data/use-range-state.ts`, `page-controls.tsx`, `kpi-tile.tsx`
- Modify: `packages/ui/src/data/delta.tsx`, `packages/ui/src/data/index.ts`
- Test: `packages/ui/tests/kpi-controls.test.tsx`

**Interfaces:**
- Produces:
  - `useRangeState(keys?: { scope: "place" | "client" }): { range: RangeKey; scopeId: string | null; setRange(r: RangeKey): void; setScopeId(id: string | null): void }`. Reads `?range=` and `?place=` (or `?client=`) from `window.location.search`, defaults `30d` and `null`, writes with `pushState`, listens to `popstate`. An unknown `range` in the address falls back to `30d`.
  - `PageControls({ range, onRange, options, value, onValue, allLabel, scopeLabel }: ...)`: a `radiogroup` of 7D, 30D, 90D (`aria-checked`) and a `Select` of `options: {value: string; label: string}[]` with an "all" entry.
  - `UpdatedStamp({ at, note }: { at: string; note: string })` renders `Updated HH:MM · {note}` in the viewer's locale.
  - `Delta` gains `unit?: "%" | "pts"` (default `"%"`); `pts` renders `0.2 pts`, still with the sr-only up/down/no change words; `goodWhen` unchanged.
  - `KpiTile({ label, value, unit, delta, deltaUnit, goodWhen, note, spark, sparkLabel, href, state }: ...)` where `state` is `"ok" | { tooFew: number } | "none"`. `tooFew` renders `Too few answers ({n})` instead of the delta and trend; `none` renders `No data yet`. With `href` the whole tile is an `<a>`. The figure uses the serif face (`font-serif`) like `StatTile`; the tile has `rounded-card border border-frame`.

- [ ] **Step 1: Write failing tests:**
  - `useRangeState`: with the address `/?range=7d&place=p1` it returns `7d` and `p1`; with `?range=bogus` it returns `30d`; `setRange("90d")` changes `location.search` to contain `range=90d` and keeps `place=p1`; Back restores the previous value.
  - `PageControls`: three radios named 7D, 30D, 90D; the current one has `aria-checked="true"`; clicking 7D calls `onRange("7d")`.
  - `Delta` with `unit="pts"` and `value={-3}` and `goodWhen="up"` shows `3 pts` and the text `down`, and is clay.
  - `KpiTile` with `state={{ tooFew: 4 }}` shows `Too few answers (4)` and no delta and no sparkline; with `state="none"` shows `No data yet`; with `href` it is a link whose accessible name includes the label and the value; with `spark` it renders an `img` whose label is `sparkLabel`.
- [ ] **Step 2: Run to verify failure.** `cd packages/ui && bun test tests/kpi-controls.test.tsx`.
- [ ] **Step 3: Implement.** Reuse `Select` from `../forms` and `Sparkline` from `./charts`; keep `useRangeState` independent of `useTableState` (the builder checked: that hook owns table keys and a sort, so a sibling is cleaner).
- [ ] **Step 4: Run to verify pass**; then `bun run lint:fix` and `bun run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): range and place in the address, the page controls and the figure tile`.

---

### Task 7: The trend chart and the topic split

**Files:**
- Create: `packages/ui/src/data/trend-chart.tsx`, `split-bars.tsx`
- Modify: `packages/ui/src/data/index.ts`
- Test: `packages/ui/tests/trend-split.test.tsx`

**Interfaces:**
- Produces:
  - `TrendChart({ points, label, min, max }: { points: { date: string; average: number | null; count: number }[]; label: string; min?: number; max?: number })`: an `svg` with `role="img"` and `aria-label` that states the first and last average and the total answers, a daily line of `average` (gaps where `average` is null, never drawn as zero), volume bars behind it, a visually hidden `<table>` with one row per date (date, average, answers), and a focusable readout of the point under the pointer or keyboard focus. Default axis 3.0 to 5.0 for ratings unless `min` and `max` are given. With fewer than 2 non-null points it renders the message `Too few answers to draw a trend` instead.
  - `SplitBars({ rows, hint, empty, href }: { rows: { topic: string; total: number; positive: number; neutral: number; negative: number }[]; hint: string; empty: string; href?: (topic: string) => string })`: each row a label, a stacked bar (positive in lime with an ink outline, neutral in the line cream, negative in clay), the total, and the percentages as text (`72% negative`), a link when `href` is given. With no rows it renders `empty`.
- [ ] **Step 1: Write failing tests:**
  - `TrendChart`: the `img` label contains the first average, the last average and the number of answers; the hidden table has one body row per point; a point with `average: null` yields a row with an empty average cell and no `NaN` in the document text; fewer than 2 valid points shows `Too few answers to draw a trend` and no `svg`.
  - `SplitBars`: a row `{ topic: "wait-time", total: 29, positive: 5, neutral: 3, negative: 21 }` shows `72% negative` and `29`; segments widths sum to 100% (assert the three `style.width` values parse and sum to 100 within 0.5); `href` makes the row a link to `href("wait-time")`; empty rows show the `empty` text; a row with `total: 0` is not rendered.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Topic names come from `TOPICS` in contracts as slugs; show them humanised (`wait-time` to `Wait time`) through one small pure function in the same file, tested above.
- [ ] **Step 4: Run to verify pass**; `bun run lint:fix`, `bun run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): the trend chart and the ranked sentiment split`.

---

### Task 8: The owner Overview page

**Files:**
- Create: `packages/ui/src/shell/overview-owner.tsx`
- Modify: `packages/ui/src/shell/overview.tsx`, `packages/ui/tests/pages.test.tsx` (the platform Overview test at line 266)
- Test: `packages/ui/tests/overview-owner.test.tsx`

**Interfaces:**
- Consumes: `api.insightsOwner`, `useRangeState({ scope: "place" })`, `PageControls`, `KpiTile`, `TrendChart`, `SplitBars`, `UpdatedStamp`, `DataTable`/`Table` parts, `PageHeader`, `Skeleton`, `useMe`.
- Produces: `OwnerOverview(): JSX.Element`; `OverviewPage({ surface })` renders `OwnerOverview` for `"platform"` and `AgencyOverview` for `"manager"` (Task 9 supplies the latter; until then keep the old body for `"manager"`).

Layout, top to bottom (spec section 2): header with `PageControls` (place options from `api.places()`), four tiles (Average rating, Responses, Review link clicks, Waiting on you; the last is the only `bg-lime-100` block and links to `/reputation/cases?status=overdue` if any overdue else `/reputation/cases`), then Rating over time next to What guests mention, then Your places table next to What Host did (three lines), then the `UpdatedStamp`. Every figure links to its page with the range and place in the address (`/reputation/responses?range=…&place=…`; topic rows add `&topic=…`).

- [ ] **Step 1: Write failing tests** with `fakeFetch` and `ownerInsightsFixture` (use the `inside(ownerMe, …)` helper pattern of `pages.test.tsx`):
  - Shows the four tile labels and the figures from the fixture; the rating tile shows `up 0.2 pts`.
  - A fixture with `rating.small: true` shows `Too few answers (9)` on the rating tile and no sparkline, and the trend chart shows its too-few message.
  - A fixture with `topics: []` and `read: 0` shows `No reading yet for these answers`.
  - Clicking `30D`→`7D` refetches with `range=7d` and the address contains `range=7d`; choosing a place refetches with `place=<id>` (assert on the recorded fetch URLs).
  - The places table lists the overdue place first and shows `—` for a place with null rating.
  - The `Waiting on you` tile links to `/reputation/cases?status=overdue` when `waiting.overdue > 0`.
  - A rejected fetch shows `Could not load the overview` with a `Retry` button, and no tile.
  - The `UpdatedStamp` is present and names the range's comparison (`compared with the previous 30 days`).
- [ ] **Step 2: Run to verify failure.** `cd packages/ui && bun test tests/overview-owner.test.tsx`.
- [ ] **Step 3: Implement** the page and the dispatch in `overview.tsx`. Update the platform case in `pages.test.tsx` to the new page (its old assertions on bare counters no longer apply).
- [ ] **Step 4: Run to verify pass**, then the whole package: `bun run --filter @atrium/ui test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): the owner's Overview, figures with change, a trend, topics and places`.

---

### Task 9: The agency Overview page

**Files:**
- Create: `packages/ui/src/shell/overview-agency.tsx`
- Modify: `packages/ui/src/shell/overview.tsx`, `packages/ui/tests/pages.test.tsx` (the manager Overview test at line 282)
- Test: `packages/ui/tests/overview-agency.test.tsx`

**Interfaces:**
- Consumes: `api.insightsAgency`, `useRangeState({ scope: "client" })`, `PageControls`, `KpiTile`, `Table` parts, `Sparkline`, `StatusBadge`.
- Produces: `AgencyOverview(): JSX.Element`.

Layout (spec section 3): header with `PageControls` (client options from `api.places()` grouped to unique clients), then Needs a person now (lime-wash block, the queue table with a button per row linking to `item.href`, and a footer of links per kind using `queueCounts`, e.g. `3 more cases`), then four tiles (Median time to contact against the 24h target, Overdue cases, Portfolio rating, Request to answer rate), then Your clients table (rating, 30-day sparkline, change, responses, answer rate, overdue, status from `clientStatus` semantics as a `StatusBadge`), then the `UpdatedStamp`.

- [ ] **Step 1: Write failing tests** with `agencyInsightsFixture`:
  - The queue lists the overdue item first with an `overdue` mark and a link to its `href`; with `queueCounts.cases` 12 and 8 rows it shows `4 more cases`.
  - An empty queue shows `Nothing needs a person right now`.
  - The contact tile shows `6h 12m`, `Target 24h`, and the share inside target as text.
  - A client with null rating shows `Too few answers` in the trend cell and `—` in rating and change; its status shows the word, not colour alone.
  - Range and client controls refetch with `range=` and `client=`.
  - Error state as in Task 8.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** and replace the manager branch in `overview.tsx`; update the manager case in `pages.test.tsx`.
- [ ] **Step 4: Run to verify pass**, then the whole UI package.
- [ ] **Step 5: Commit** `feat(ui): the agency's Overview, a queue first and the portfolio after`.

---

### Task 10: The history seed

**Files:**
- Create: `apps/worker/scripts/seed-history.ts`
- Modify: `package.json` (root; add `"seed:history": "bun apps/worker/scripts/seed-history.ts"`)
- Test: `apps/worker/tests/seed-history.test.ts`

**Interfaces:**
- Produces: `buildHistory(input: { seed: number; now: Date; days: number }): HistoryPlan` (pure and exported, no database), where `HistoryPlan` lists clients (by slug), locations (with time zones) and, per location, dated answers (rating, sentiment, topics, comment, whether a case opens, whether the review link was clicked) and review requests. The script then inserts the plan the way `seed.ts` does, finding clients by slug so a second run adds nothing.

Shape the plan must have: at least 2 clients and 4 places; 90 days; a slow rise in average rating at one place; a dip in the last 14 days at another; `wait-time` mostly negative; one client with fewer than 10 answers; exactly one overdue open case and two due soon; answers at times that fall on different local days in different zones.

- [ ] **Step 1: Write failing tests** for `buildHistory`: the same `seed` gives deep-equal plans; different seeds differ; at least 2 clients, 4 locations, 90 distinct dates; the small client has fewer than 10 answers; the plan has exactly one overdue case at `now`; ratings are integers 1 to 5; `wait-time` negative share is above 60%.
- [ ] **Step 2: Run to verify failure.** `cd apps/worker && bun test tests/seed-history.test.ts`.
- [ ] **Step 3: Implement** `buildHistory` with a small seeded generator (mulberry32) and the insertion script.
- [ ] **Step 4: Run to verify pass**; then, with Postgres up, run `bun run seed:history` twice and confirm the second run reports nothing new.
- [ ] **Step 5: Commit** `feat(worker): a 90-day history seed for trying the Overview`.

---

### Task 11: Docs, EN and ES

**Files:**
- Create: `apps/docs/docs/guides/reading-the-overview.md`, `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/guides/reading-the-overview.md`
- Modify: both guides `index.md`, `apps/docs/docs/product/platform.md` and `manager.md` and their ES twins (a link and one sentence each), `docs/superpowers/specs/2026-10-16-ui-foundations-design.md` roadmap (Overview is delivery 2, Cases 3, Responses/Help/Places 4).

The guide holds: what each page answers; every definition from Global Constraints in plain words; the small-sample rule; how the range and place work and that the address can be shared; what each block links to; and what is not there yet (signals metrics, benchmark, custom ranges).

- [ ] **Step 1: Write the two pages and the edits.**
- [ ] **Step 2: Build the docs in both languages.** Run: `bun run --filter @atrium/docs build`. Expected: success with no broken links.
- [ ] **Step 3: Commit** `docs(ui): reading the Overview, EN and ES`.

---

### Task 12: Verify in the browser

**Files:** none (a check, with screenshots reviewed by the person running it).

- [ ] **Step 1: Bring everything up** in the worktree: `docker compose up -d postgres`, `bun run db:migrate`, `bun run seed`, `bun run seed:history`, then the API, Manager and Platform dev servers (`set -a; . ./.env.local; set +a` first).
- [ ] **Step 2: Walk both Overviews** at 1440px and at a narrow width (use DevTools device mode, since a browser window will not go under about 1070px): the owner as the demo owner, the agency as the demo account manager. Check: each range changes every number; the place and client selects narrow the page; the address carries `range`, `place` or `client` and survives a reload; every tile and row link lands on the right page; the too-few state appears for the small client; the empty topic state appears when no answer has a reading; lime appears once per page (plus the queue wash on the agency page); nothing overflows or overlaps; focus rings are visible when tabbing through the page.
- [ ] **Step 3: Run the whole CI:** `bun run ci`. Expected: lint, deps, typecheck and all tests pass.
- [ ] **Step 4: Fix what the walk found** with the same test-first steps, one commit per fix, and re-run Step 3.
