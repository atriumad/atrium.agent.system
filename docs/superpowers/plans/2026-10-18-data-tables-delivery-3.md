# Data Tables, Delivery 3 (shared pieces, Cases, Responses) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cases and Responses lists with the section-page pattern: a summary band on top, a conventional full-width table below with filters, sorting and pagination; give a case its own page and a response a side drawer.

**Architecture:** Pure helpers in `modules/reputation/domain/tables.ts`; list queries and band queries in `modules/reputation/application/` read through the caller's `Tx` (row-level security shapes tenancy); thin routes in `apps/api`; in `@atrium/ui`, a `DataSectionPage` template with a `SectionBand`, table cell helpers, a stricter `DataTable` (sticky header, single-line truncated cells), and two new pages. Responses paginate, filter and sort on the server; Cases filter and page in the browser over the full list with server-computed counts.

**Tech Stack:** Bun, TypeScript, Hono + Drizzle (Postgres), React 19 + Tailwind v4 + Base UI, `bun test` with Testing Library, Next.js apps, Docusaurus (EN/ES).

**Spec:** `docs/superpowers/specs/2026-10-18-data-tables-design.md` (delivery 3 sections 1 to 3, 5, 6 and the "Settled during review" section 7). Style: `docs/superpowers/specs/2026-10-16-ui-foundations-design.md` (Revision) and the Overview spec `2026-10-17-overview-analytics-design.md` for definitions, units and the small-sample rule.

## Global Constraints

- Branch `feat/ui-foundations`, worktree `/Users/ventura/Desktop/d/atrium/atrium.ui`, after delivery 2 is complete. One commit per task, message in English, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Module boundaries (`bun run check:deps`): `modules/reputation` imports only `@atrium/core` (public API), `@atrium/contracts`, `@atrium/scoring` and itself; `domain/` imports only `domain/`, contracts and scoring. Any client component (hooks, handlers, `window`) starts with `"use client";` (guard test `packages/ui/tests/use-client.test.ts`).
- Table rules: row height 44px, one line per row, `truncate` with a `title` holding the full text; first column is the identity and the real link of the row, the whole row is clickable (`rowHref`, existing) and inner links/buttons keep working; numbers right-aligned in tabular figures; every state is a pill with a word and a mark (never colour alone); dates as `Oct 18, 9:40` in the viewer's time zone with the relative form in the `title`; stars as text `★★☆☆☆` with `aria-label` "2 of 5"; sticky sortable header with `aria-sort`; sort, filters, search, page and range live in the address; under `md` the table scrolls horizontally with the first column pinned.
- Band: `clamp(14rem, 30vh, 20rem)` minimum height on `lg` and wider, stacked below; it follows range and place (the `PageControls` and `useRangeState` of delivery 2), NOT the table's chips, search or column filters; it has its own loading skeleton and error with Retry so it never blocks the table; its title says "for the last N days".
- Style: cream page and cards, `border-frame`, no shadow on content, lime sparingly (the one wash/accent), serif figures (sans for durations), tokens as Tailwind classes. Layout works from 390px.
- Units and definitions are the Overview's: rating change in rating points, rate changes in percentage points, counts change in percent; small-sample rule `MIN_SAMPLE = 10` (shared constant in `domain/insights.ts`); "overdue" is `status = 'open'` and `due_at` passed; the 24h contact target; "negative" means stored `sentiment = 'negative'`.
- Negative share = negative answers / answers WITH a `sentiment` (read answers) in the window; its change is `null` unless at least 10 were read in both windows. An answer with no reading is not negative; rows show a dash for sentiment and topics.
- Routes: no `scope.kind` check (rows are shaped by row-level security); unknown `range` is 422 `{error: "invalid_range"}`; a non-UUID `place` is 422 `{error: "invalid_id"}`; an unknown `sort` or `dir`, a `rating` outside 1 to 5, an unknown `sentiment` or `topic` is 422 `{error: "invalid_query"}`; an id out of the caller's scope returns empty results, never 403; `pageSize` default 25, capped at 100; a `page` beyond the last returns empty `rows` with the true `total`.
- `q` is a case-insensitive substring match over `comment`, `best_part` and `improve`, parameterised, with `\`, `%` and `_` escaped (`escapeLike`).
- The old `?case=<id>` is still read and redirected to the case route keeping every other query parameter.
- Copy is English in code; docs are EN and ES. No CSV export, no bulk selection, no column chooser.

## Review Focus

1. A `q` made of `%`, `_`, `\`, quotes or SQL text must match literally and never error or leak other rows (Task 2).
2. `page` beyond the last, `pageSize` 0, 1000, negative or non-numeric, and an unknown `sort` (Task 2).
3. More than 200 cases in the window: tab counts and the band must come from the server and stay right while the table says "Showing the latest 200" (Task 3, Task 4, Task 8).
4. Answers never read (`sentiment`/`topics` null): dash in the table, excluded from the negative share, a note with how many were not read (Tasks 1, 4, 9).
5. A case id outside the caller's scope, or an old `?case=` link with extra parameters: not-found state (not a blank page) and a redirect that keeps the other parameters (Task 7).

## File Structure

| File | Responsibility |
| --- | --- |
| `modules/reputation/domain/tables.ts` (create) | Pure: `escapeLike`, `ratingDistribution`, `severitySplit`, `caseInWindow`, `caseCounts`, `negativeCompare`, sort and tab constants. |
| `modules/reputation/application/responses.ts` (create) | `listResponsesPage`, `responsesBand`. |
| `modules/reputation/application/cases-table.ts` (create) | `listCasesTable`, `casesBand`. |
| `modules/reputation/index.ts` (modify) | Exports. |
| `apps/api/src/surveys-admin.ts`, `apps/api/src/cases.ts` (modify), `apps/api/src/insights.ts` (modify) | Routes: paged responses, cases with counts, the two band routes. |
| `packages/ui/src/api.ts`, `tests/fake-api.ts` (modify) | Types, methods, fixtures. |
| `packages/ui/src/data/data-table.tsx`, `table.tsx` (modify) | Sticky header, `truncate`, `dense` rows, `title`s. |
| `packages/ui/src/data/section-page.tsx` (create) | `DataSectionPage`, `SectionBand`. |
| `packages/ui/src/data/cells.tsx` (create) | `Stars`, `TopicChips`, `When`, `SeverityPill`, `humaniseTopic` reuse. |
| `packages/ui/src/cases-table-page.tsx`, `case-detail-page.tsx` (create); `cases-app.tsx` (modify) | The new Cases page and the case page. |
| `packages/ui/src/responses-page.tsx`, `response-drawer.tsx` (create); `surveys-app.tsx` (modify) | The new Responses page and drawer. |
| `apps/manager/app/(app)/reputation/cases/[id]/page.tsx`, `apps/platform/app/(app)/reputation/feedback/[id]/page.tsx` (create) | Case routes. |
| `packages/ui/src/shell/notifications.tsx` (modify) | Case links to the new route. |
| `apps/docs/...reading-tables-and-sections.md` + ES (create), indexes and product pages (modify) | Docs. |

---

### Task 1: Pure helpers

**Files:**
- Create: `modules/reputation/domain/tables.ts`
- Test: `modules/reputation/tests/tables-domain.test.ts`

**Interfaces:**
- Consumes: `compareRate`, `MIN_SAMPLE`, `Compared` from `./insights`.
- Produces: `escapeLike(input: string): string` (prefixes `\`, `%` and `_` with `\`); `ratingDistribution(ratings: number[]): [number, number, number, number, number]` (counts for 1 to 5; values outside 1 to 5 ignored); `severitySplit(severities: string[]): { high: number; medium: number; low: number }` (unknown values ignored); `type CaseTab = "active" | "open" | "contacted" | "resolved" | "all"`; `caseInWindow(c: { status: string; openedAt: Date }, from: Date): boolean` (opened at or after `from`, or status `open` or `contacted`); `caseCounts(cases: { status: string; openedAt: Date }[], from: Date): Record<CaseTab, number>` (only cases `caseInWindow`; `active` is open plus contacted); `negativeCompare(current: (string | null)[], previous: (string | null)[]): Compared` (sentiments; read = non-null; `compareRate` with num negative, den read); `RESPONSE_SORTS = ["date", "rating", "place", "sentiment"] as const`, `type ResponseSort`, `type SortDir = "asc" | "desc"`.

- [ ] **Step 1: Write the failing tests** (names and assertions):
  - `escapeLike("50%_off\\")` is `"50\\%\\_off\\\\"`; `escapeLike("plain")` is `"plain"`.
  - `ratingDistribution([5, 5, 1, 3, 3, 3, 0, 6])` is `[1, 0, 3, 0, 2]`.
  - `severitySplit(["high", "low", "low", "weird"])` is `{ high: 1, medium: 0, low: 2 }`.
  - `caseInWindow`: a `contacted` case opened a year before `from` is true; a `resolved` case opened before `from` is false; a `resolved` case opened on `from` is true.
  - `caseCounts` for 2 open, 1 contacted, 3 resolved in the window and 1 resolved outside: `{ active: 3, open: 2, contacted: 1, resolved: 3, all: 6 }`.
  - `negativeCompare`: 12 read (3 negative) now and 11 read (5 negative) before gives `value` 0.25 and `change` `-20.45...` (within 1e-6) and `small` false; nulls are not read: `[...10 "negative", ...20 null]` has `n` 10; 9 read now gives `small` true and `change` null; 10 now and 9 before gives `change` null; empty arrays give `value` null.
- [ ] **Step 2: Run to verify failure.** `cd modules/reputation && bun test tests/tables-domain.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the signatures above in `domain/tables.ts` (no imports beyond `./insights`).
- [ ] **Step 4: Run to verify pass.** Expected: PASS; then `bun run check:deps && bun run typecheck`.
- [ ] **Step 5: Commit** `feat(reputation): pure helpers for the tables, like-escaping, distribution, case counts`.

---

### Task 2: Responses list on the server

**Files:**
- Create: `modules/reputation/application/responses.ts`
- Modify: `modules/reputation/index.ts`, `apps/api/src/surveys-admin.ts`
- Test: `modules/reputation/tests/responses-list.test.ts`, `apps/api/tests/responses-table.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `listLocationLabels`/`describeLocations` from `@atrium/core`; `surveyResponses`, `recoveryCases` from `../infra/schema`; `Range`, `RANGE_DAYS` from `../domain/insights`.
- Produces:
  - `type ResponseQuery = { range: Range; locationId?: string; q?: string; maxRating?: number; rating?: number; sentiment?: "positive" | "neutral" | "negative"; topic?: string; wantsContact?: boolean; hasCase?: boolean; safety?: boolean; sort: ResponseSort; dir: SortDir; page: number; pageSize: number; now: Date }`.
  - `type ResponseTableRow = SurveyResponseRow & { sentiment: string | null; topics: string[] | null; concern: string | null; safety: boolean | null }` (`SurveyResponseRow` is the existing type in `application/admin.ts`).
  - `type ResponsesPage = { rows: ResponseTableRow[]; total: number; page: number; pageSize: number; unread: number; counts: { all: number; lowRating: number; wantsContact: number; hasCase: number; safety: number } }`; `unread` is the number of rows in the FILTERED set without a reading; `counts` are computed over the window and place only (not over `q` or the other filters).
  - `listResponsesPage(tx: Tx, scope: Scope, query: ResponseQuery): Promise<ResponsesPage>`.
  - Route `GET /api/surveys/responses`: when `page` is present in the query it parses `range` (default `30d`), `place`, `q`, `maxRating`, `rating`, `sentiment`, `topic`, `wantsContact`, `hasCase`, `safety` (`1` or `true`), `sort` (default `date`), `dir` (default `desc`), `page` (default 1), `pageSize` (default 25, capped at 100) and returns `ResponsesPage` with dates as ISO strings; when `page` is absent it keeps the legacy shape `{ responses }` and the legacy `locationId` and `maxRating` filters (existing callers and tests keep passing).

- [ ] **Step 1: Write the failing tests.**
  - Module level (harness of `modules/reputation/tests/insights.test.ts`): 30 answers across two places and two zones; page 2 of size 10 returns rows 11 to 20 of the date-desc order and `total` 30; `sort: "rating", dir: "asc"` orders by rating then date; filters combine with AND (`maxRating` 3 plus `wantsContact` true); `sentiment`/`topic` match only read answers; `q: "50%"` matches only a comment containing the literal `50%` and `q: "_"` does not match every row; a `q` of `'; drop table` and `\\` returns 0 rows and does not throw; `unread` counts filtered rows with null sentiment; `counts` ignore `q` and column filters but respect `range` and `locationId`; a `page` beyond the last returns `rows: []` and the true `total`; rows carry `sentiment`, `topics`, `concern`, `safety`.
  - API level (harness of `apps/api/tests/surveys-admin.test.ts`): an owner never sees another client's rows (distinctive name of client B absent from the JSON); `pageSize=1000` is clamped to 100; `pageSize=0`, `page=0`, `page=abc` are 422 `invalid_query`; `sort=evil` is 422 `invalid_query`; `range=1y` is 422 `invalid_range`; `place=not-a-uuid` is 422 `invalid_id`; no `page` keeps the legacy `{ responses }` shape; a `place` of another client returns empty rows and `total` 0; unauthenticated is 401.
- [ ] **Step 2: Run to verify failure.** `cd modules/reputation && bun test tests/responses-list.test.ts` and `cd apps/api && bun test tests/responses-table.test.ts` (from the repo root first run `set -a; . ./.env.local; set +a`; Postgres must be up). Expected: FAIL.
- [ ] **Step 3: Implement `listResponsesPage`** with Drizzle `ilike`/`sql` templates and `escapeLike` (use `ESCAPE '\'`), join the cases table for `hasCase`/`caseId`, one count query for `total` and one for `counts`, then the page query with `limit`/`offset`; keep tenancy to the passed `Tx`. Implement the route parsing in `surveys-admin.ts` with the Global Constraints' error codes.
- [ ] **Step 4: Run to verify pass**; then `bun run check:deps && bun run typecheck && bun run lint:fix`.
- [ ] **Step 5: Export** `listResponsesPage`, `ResponseQuery`, `ResponsesPage`, `ResponseTableRow` from `modules/reputation/index.ts`. **Commit** `feat(reputation): responses paged, filtered and sorted on the server`.

---

### Task 3: Cases list with counts

**Files:**
- Create: `modules/reputation/application/cases-table.ts`
- Modify: `modules/reputation/index.ts`, `apps/api/src/cases.ts`
- Test: `modules/reputation/tests/cases-table.test.ts`, `apps/api/tests/cases-table.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; the existing `listCaseSummaries(tx, status?)` and `CaseSummary` in `application/recovery.ts` (read it: it already joins the answer).
- Produces:
  - `type CaseTableRow = CaseSummary & { comment: string | null; topics: string[] | null; sentiment: string | null; safety: boolean | null }` (`comment` is the first 160 characters).
  - `type CasesTable = { cases: CaseTableRow[]; counts: Record<CaseTab, number>; truncated: boolean }`.
  - `listCasesTable(tx: Tx, input: { range: Range; now: Date }): Promise<CasesTable>`: cases in the window per `caseInWindow` (from = `now` minus the range's days), newest first, up to 200 rows; `counts` over ALL cases in the window (not the 200 loaded); `truncated` true when more than 200 matched.
  - Route `GET /api/cases` keeps `status` and returns `{ cases, counts, truncated }` (additive; `range` defaults `30d`; `range=1y` is 422 `invalid_range`; an unknown `status` stays 422 `invalid_status`).

- [ ] **Step 1: Write the failing tests.** Module: 205 open cases give `cases.length` 200, `truncated` true and `counts.all` 205 and `counts.active` 205; a resolved case older than the window is absent and not counted; a contacted case older than the window is present and counted in `contacted` and `active`; rows carry a comment cut to 160 characters with an ellipsis-free hard cut, `topics`, `sentiment`, `safety`, and `null`s for an unread answer; the existing fields (`dueAt`, `status`, `severity`) are unchanged. API: client A never sees client B's cases or names; `?status=open` still works and counts still cover the whole window; no session is 401; the legacy response keys `cases` still present (existing tests in `apps/api/tests/cases.test.ts` keep passing).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** by extending the select used by `listCaseSummaries` (do not duplicate it: factor the shared join into one helper in `recovery.ts` or `cases-table.ts`), computing counts with the Task 1 `caseCounts` over a lightweight select of `status, openedAt` for the whole window, and wiring the route.
- [ ] **Step 4: Run to verify pass**; `bun run check:deps && bun run typecheck && bun run lint:fix`; run the existing `apps/api/tests/cases.test.ts` and `modules/reputation` suites once (the known unrelated failure `flow.test.ts` "the team works a case from open to resolved" may still fail on clean HEAD; do not touch it).
- [ ] **Step 5: Commit** `feat(reputation): the case list carries the answer's text and topics, with counts over the whole window`.

---

### Task 4: Band data and routes

**Files:**
- Modify: `modules/reputation/application/responses.ts`, `modules/reputation/application/cases-table.ts`, `modules/reputation/index.ts`, `apps/api/src/insights.ts`
- Test: `modules/reputation/tests/bands.test.ts`, `apps/api/tests/bands.test.ts`

**Interfaces:**
- Consumes: `negativeCompare`, `ratingDistribution`, `severitySplit`, the Overview's `compareMean`, `compareCount`, `compareRate`, `dailySeries`-style windows (`windowDates`, `localDate`), `median`, and `Tile`/`loadInsightData` helpers in `application/insights.ts` (read it and reuse its selects; do not duplicate them).
- Produces:
  - `type ResponsesBand = { range: Range; generatedAt: string; window: { from: string; to: string }; responses: Tile; rating: Tile; negativeShare: { value: number | null; change: number | null; read: number; small: boolean }; reviewClicks: { clicks: number; answers: number; rate: number | null; change: number | null; small: boolean }; distribution: [number, number, number, number, number] }` and `responsesBand(tx: Tx, input: { range: Range; locationId?: string; now: Date }): Promise<ResponsesBand>` (units as in the Overview: `rating.change` rating points, `negativeShare.change` and `reviewClicks.change` percentage POINTS, `responses.change` percent).
  - `type CasesBand = { range: Range; generatedAt: string; window: { from: string; to: string }; open: number; overdue: { value: number; previous: number }; contact: { medianHours: number | null; insideTarget: number | null; cases: number; change: number | null; small: boolean }; resolved: { value: number; change: number | null; small: boolean }; openedPerDay: { date: string; count: number }[]; bySeverity: { high: number; medium: number; low: number } }` and `casesBand(tx: Tx, input: { range: Range; locationId?: string; now: Date }): Promise<CasesBand>` (`open` and `overdue.value` are "now" figures and equal the Active tab's count and its overdue subset; `openedPerDay` has one entry per local date of the window; `bySeverity` over cases in the window).
  - Routes `GET /api/insights/responses?range=&place=` and `GET /api/insights/cases?range=&place=` returning those objects (same validation errors as Global Constraints; no `scope.kind` check).

- [ ] **Step 1: Write the failing tests.** Module: a window with 12 read answers (3 negative) and 8 unread gives `negativeShare.value` 0.25, `read` 12 and `rating` over ALL 20 answers; `distribution` sums to the answer count; fewer than 10 read gives `negativeShare.small` true and `change` null; zero data gives zero counts and nulls and no `NaN` anywhere in `JSON.stringify`; cases: 3 open (1 overdue) give `open` 3 and `overdue.value` 1; `openedPerDay` has exactly the range's number of entries; `bySeverity` sums to the cases in the window; `contact` follows the Overview's definition (median of `contacted_at - opened_at`, share inside target). API: tenancy (client A never sees B's numbers), `range=1y` 422, `place=` another client's id returns zeros, no session 401.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** both functions and the two routes (mount in `mountInsights`).
- [ ] **Step 4: Run to verify pass**; `bun run check:deps && bun run typecheck && bun run lint:fix`.
- [ ] **Step 5: Commit** `feat(reputation): band figures for the Cases and Responses pages`.

---

### Task 5: UI API client and fixtures

**Files:**
- Modify: `packages/ui/src/api.ts`, `packages/ui/tests/fake-api.ts`
- Test: `packages/ui/tests/tables-api.test.ts`

**Interfaces:**
- Produces in `api.ts`: types `ResponseTableRow`, `ResponsesPage`, `ResponsesQuery`, `CaseTableRow`, `CasesTable`, `ResponsesBand`, `CasesBand` mirroring Tasks 2 to 4 field for field (dates as `string`); methods `api.responsesPage(query: ResponsesQuery): Promise<ResponsesPage>` (builds `/api/surveys/responses?page=…`, omitting empty parameters), `api.casesTable(range: RangeKey): Promise<CasesTable>` (`/api/cases?range=…`), `api.casesBand(range: RangeKey, place?: string): Promise<CasesBand>`, `api.responsesBand(range: RangeKey, place?: string): Promise<ResponsesBand>`. The existing `api.cases()` and `api.surveyResponses()` keep working for other callers (Overview, Help attachments).
- In `fake-api.ts`: typed fixtures `responsesPageFixture` (8 rows, one unread, `total` 107, `unread` 1, `counts` all 107, lowRating 31, wantsContact 9, hasCase 14, safety 1), `casesTableFixture` (4 cases: 1 overdue, counts `{active: 3, open: 3, contacted: 0, resolved: 11, all: 14}`), `responsesBandFixture`, `casesBandFixture` with units as the server sends them (points for rate changes).

- [ ] **Step 1: Write the failing test:** URLs exactly: `api.responsesPage({ range: "30d", page: 2, pageSize: 25, sort: "date", dir: "desc", q: "cold", maxRating: 3 })` calls `/api/surveys/responses?range=30d&page=2&pageSize=25&sort=date&dir=desc&q=cold&maxRating=3` (parameter order as listed in the type); empty `q`/`place`/filters omitted; `api.casesTable("7d")` calls `/api/cases?range=7d`; `api.casesBand("90d", "p1")` calls `/api/insights/cases?range=90d&place=p1`; `api.responsesBand("30d")` calls `/api/insights/responses?range=30d`.
- [ ] **Step 2: Run to verify failure.** `cd packages/ui && bun test tests/tables-api.test.ts`.
- [ ] **Step 3: Implement** types, methods and fixtures.
- [ ] **Step 4: Run to verify pass**; `bun run lint:fix`, `bun run typecheck`, whole `@atrium/ui` suite once.
- [ ] **Step 5: Commit** `feat(ui): client and fixtures for the table pages`.

---

### Task 6: The table rules and the section template

**Files:**
- Modify: `packages/ui/src/data/data-table.tsx`, `packages/ui/src/data/table.tsx`, `packages/ui/src/data/index.ts`
- Create: `packages/ui/src/data/section-page.tsx`, `packages/ui/src/data/cells.tsx`
- Test: `packages/ui/tests/section-page.test.tsx`, additions to `packages/ui/tests/data.test.tsx`

**Interfaces:**
- Produces:
  - `Column<Row>` gains `truncate?: boolean` (one line with ellipsis; the cell gets `title` equal to `titleOf?.(row)` or the text) and `titleOf?: (row: Row) => string`; `DataTableProps<Row>` gains `dense?: boolean` (44px rows, `px-3`) and `stickyHeader?: boolean` (default true when `dense`); the header is `position: sticky` with a solid `bg-surface-sunken` and an ink bottom border, and each sortable header keeps `aria-sort`.
  - `cells.tsx`: `Stars({ rating }: { rating: number })` renders `★★☆☆☆` with `aria-label` "2 of 5" (ratings clamped to 1 to 5); `TopicChips({ topics }: { topics: string[] | null })` renders up to 2 chips humanised with `humaniseTopic` (from `split-bars.tsx`) plus `+N`, or a dash when null or empty; `When({ date, now }: { date: string; now: Date })` renders `Oct 18, 9:40` with `title` the relative form; `SeverityPill({ severity }: { severity: string })` (`high` clay with the word, `medium` ink, `low` quiet), each with a word and mark; `SentimentPill({ sentiment }: { sentiment: string | null })` (positive lime-wash, negative clay, neutral quiet, null a dash).
  - `section-page.tsx`: `SectionBand({ state, onRetry, title, tiles, aside }: { state: "loading" | "error" | "ok"; onRetry: () => void; title: string; tiles: ReactNode; aside?: ReactNode })` (min-height `clamp(14rem, 30vh, 20rem)` from `lg`, stacked below, skeleton while loading, `Could not load the summary` with `Retry` on error) and `DataSectionPage({ title, description, controls, band, tabs, children }: ...)` laying out header, band, optional tabs and the children (the filter bar and table), with the page note "Filters apply to the table; the summary follows the range and place."

- [ ] **Step 1: Write the failing tests:** `Stars` for 2 gives text `★★☆☆☆` and label "2 of 5"; 0 and 9 clamp; `TopicChips` with 3 topics shows 2 chips and `+1`, with null a dash; `When` text format and `title`; `DataTable` with `dense`: the header is sticky (class), a `truncate` cell has `title` and the `truncate` class, a numeric column keeps tabular figures, and a row with a link and an inner button still opens only the link on a row click (existing behaviour must keep passing); `SectionBand` shows its skeleton while loading, shows the error with a `Retry` that calls `onRetry` while the children (the table slot) still render; `DataSectionPage` renders the filter note once.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Keep `section-page.tsx` and `cells.tsx` client-safe: files with handlers or hooks start with `"use client";`. Reuse `KpiTile`, `PageControls`, `Tabs`, `Skeleton`.
- [ ] **Step 4: Run to verify pass**; `bun run lint:fix`, `bun run typecheck`, whole `@atrium/ui` suite once (including the use-client guard).
- [ ] **Step 5: Commit** `feat(ui): the table rules and the section page template with its band`.

---

### Task 7: The case page and its links

**Files:**
- Create: `packages/ui/src/case-detail-page.tsx`, `apps/manager/app/(app)/reputation/cases/[id]/page.tsx`, `apps/platform/app/(app)/reputation/feedback/[id]/page.tsx`
- Modify: `packages/ui/src/cases-app.tsx` (export the existing `Detail` for reuse), `packages/ui/src/shell/notifications.tsx` (case links), `packages/ui/src/index.ts`, `packages/ui/tests/notifications.test.tsx`
- Test: `packages/ui/tests/case-detail-page.test.tsx`

**Interfaces:**
- Consumes: the existing `Detail({ id, me, now, onChanged, onClose })` in `cases-app.tsx` and `api.detail(id)`; read `apps/platform/app/(app)/modules/[feature]` for how this repo writes a dynamic route page and params.
- Produces: `CaseDetailPage({ surface, id }: { surface: "manager" | "platform"; id: string }): JSX.Element` (header "Case", a `Back to cases` link that uses history back when the previous entry is the list and otherwise links to the list of that surface with no params; the `Detail` content full width; a not-found state `That case does not exist or is not yours.` with a link to the list when `api.detail` answers 404 or fails with not found; loading skeleton; error with Retry). Case routes: Manager `/reputation/cases/<id>`, Platform `/reputation/feedback/<id>`. The list route reads `?case=<id>` and redirects (`router.replace`) to the case route keeping every other query parameter, implemented in the Cases page of Task 8 through an exported helper `caseHref(surface: "manager" | "platform", id: string): string`. `notificationHref` links case notifications with `caseHref` (read how it knows the surface today; if it does not, pass the surface in from the bell, which already lives in the app frame).

- [ ] **Step 1: Write the failing tests:** `caseHref("manager", "c1")` is `/reputation/cases/c1`, `caseHref("platform", "c1")` is `/reputation/feedback/c1`; `CaseDetailPage` renders the case's answer from `fakeFetch`, the back link, and, when the detail request answers 404, the not-found text (no blank page) and a link to the list; the existing bell test that expected `?case=` now expects the new route for a case notification and keeps `?place=` and `?request=` for the others.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**; the route files render `<CaseDetailPage surface=… id={params.id} />` (await params if this repo's Next version makes them a promise, as the existing dynamic route does).
- [ ] **Step 4: Run to verify pass**; whole `@atrium/ui` suite once; `bun run typecheck`; confirm both apps build the new routes: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/reputation/cases/00000000-0000-0000-0000-000000000000` must not be 500 (a 200 page with the not-found state, or a redirect to sign-in, are fine).
- [ ] **Step 5: Commit** `feat(ui): a case has its own page, and notifications open it`.

---

### Task 8: The Cases table page

**Files:**
- Create: `packages/ui/src/cases-table-page.tsx`
- Modify: `packages/ui/src/cases-app.tsx` (`CasesPage` becomes a thin wrapper that renders the new page and handles the `?case=` redirect), `packages/ui/tests/pages.test.tsx` (the Cases tests)
- Test: `packages/ui/tests/cases-table-page.test.tsx`

**Interfaces:**
- Consumes: `api.casesTable`, `api.casesBand`, `useRangeState({ scope: "place" })`, `useTableState`, `applyTableState`, `PageControls`, `KpiTile`, `SplitBars`, `BarChart`/`TrendChart` for `openedPerDay` (use `BarChart` or a small bars component; the series has counts, not averages), `DataSectionPage`, `SectionBand`, `FilterBar`, `DataTable` (`dense`), `Tabs`, `cells.tsx`, `caseHref`.
- Produces: `CasesTablePage({ surface }: { surface: "manager" | "platform" }): JSX.Element`. Band: tiles *Open* (note "N overdue"), *Overdue* (goodWhen down, "Was N in the previous N days"), *Median time to contact* (sans figure, `Target 24h`, share inside), *Resolved* (change); aside: *Opened per day* bars and the severity `SplitBars`-style rows. Tabs Active/Open/Contacted/Resolved/All with `counts` from the server. Filters: search (comment), severity, place, topic (label "Topic (read answers)"), wants contact. Columns: Severity, Rating (`Stars`), Place (client · place when `me.kind !== "client"`), What the guest said (`truncate`), Topics, Due (default sort ascending for the Active tab; `overdue` pill), Opened, Status; row link `caseHref`. Footer: "Showing a–b of n · sorted by due time" and, when `truncated`, "Showing the latest 200 cases". Table state spec: `filterKeys: ["tab", "severity", "place", "topic", "contact"]`, default sort `due:asc`. The 30-second refresh of today's page is kept for the table (not the band).

- [ ] **Step 1: Write the failing tests** with `fakeFetch`, `casesTableFixture` and `casesBandFixture`: band tiles show figures and units by text (`6h 12m`, `Target 24h`); tab counts come from `counts` (not from the loaded rows: use a fixture where `counts.resolved` is 11 and only 2 resolved rows are loaded); the overdue case sorts first and shows an `overdue` word; clicking a tab or filter updates the address and the visible rows; a row link points to `/reputation/cases/<id>` (manager) or `/reputation/feedback/<id>` (platform); a `truncated` fixture shows "Showing the latest 200 cases"; an unread answer shows a dash in Topics; changing the range refetches both band and table with `range=7d`; the band error does not hide the table and its Retry refetches only the band; an old `?case=abc&range=7d` address redirects to the case route keeping `range=7d` (assert `router.replace` or `location` target); the empty states ("No cases here" vs "Your filters found nothing" with Clear filters); a Platform user does not see the client name.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** the page and wire `CasesPage`; update the Cases cases in `pages.test.tsx` to the new page; remove now-dead list code from `cases-app.tsx` (`CaseRow`, the list panel, the side detail wiring) but keep `Detail` exported for Task 7.
- [ ] **Step 4: Run to verify pass**; whole `@atrium/ui` suite once; `bun run lint:fix && bun run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): Cases as a table with a summary band`.

---

### Task 9: The Responses table page and drawer

**Files:**
- Create: `packages/ui/src/responses-page.tsx`, `packages/ui/src/response-drawer.tsx`
- Modify: `packages/ui/src/surveys-app.tsx` (`ResponsesPage` renders the new page; remove the old `Responses` list), `packages/ui/tests/pages.test.tsx`
- Test: `packages/ui/tests/responses-page.test.tsx`

**Interfaces:**
- Consumes: `api.responsesPage`, `api.responsesBand`, `useRangeState({ scope: "place" })`, `useTableState`, the section pieces and cells from Task 6, `BarChart` for the distribution, the existing `Drawer` from `feedback/overlays`.
- Produces: `ResponsesPage` (same exported name, new body). Table state spec: `filterKeys: ["tab", "rating", "sentiment", "topic", "place"]`, default sort `date:desc`; the page maps the state to `ResponsesQuery` (tab `low` → `maxRating: 3`, `contact` → `wantsContact: true`, `case` → `hasCase: true`, `safety` → `safety: true`), fetches on every change of state or range (stale responses discarded with the same guard as the Overview pages), and keeps the previous rows visible with an `aria-busy` state while loading. Band: tiles *Responses*, *Average rating*, *Negative share* (note "of N answers that were read"), *Review link clicks* (against all answers); aside: the five-bar rating distribution with counts. Tabs All, 3 stars or fewer, Wants contact, Has a case, Safety with `counts` from the response. Columns: Date (default sort), Rating, Place, Comment (`truncate`), Sentiment (`SentimentPill`), Topics, Contact, Review (check), Case (link via `caseHref`). Footer: "Showing a–b of n · sorted by …" and, when `unread` > 0, "N rows have no reading yet". Row click opens `ResponseDrawer`, a side drawer with the full answer (best part, improve, comment), the reading (sentiment, concern, safety) and "Open case" if any; Escape closes and focus returns to the row; the address does NOT change.

- [ ] **Step 1: Write the failing tests** with `fakeFetch` and `responsesPageFixture`: the first request URL has `range=30d`, `page=1`, `pageSize=25`, `sort=date`, `dir=desc`; typing in search refetches with `q=` after the state changes and resets to page 1; choosing the "3 stars or fewer" tab sends `maxRating=3`; sorting by Rating sends `sort=rating&dir=asc`; the pager's page 2 sends `page=2` and the footer reads "Showing 26–50 of 107"; an unread row shows dashes and the footer note appears; the negative-share tile shows "of N answers that were read" and `Too few answers` when small; the distribution renders five bars with counts and a text alternative; clicking a row opens the drawer with the full comment and the case link, Escape closes it, and the address is unchanged; a stale response arriving after a newer request does not overwrite it; the error state of the band does not hide the table; a request error on the table shows `Could not load responses` with Retry.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** and update `pages.test.tsx` for Responses; delete the dead list code in `surveys-app.tsx` that only the old Responses used (keep what Help and Forms still use).
- [ ] **Step 4: Run to verify pass**; whole `@atrium/ui` suite once; `bun run lint:fix && bun run typecheck`.
- [ ] **Step 5: Commit** `feat(ui): Responses as a server-paged table with a summary band and a drawer`.

---

### Task 10: Docs, EN and ES

**Files:**
- Create: `apps/docs/docs/guides/tables-and-section-pages.md`, `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/guides/tables-and-section-pages.md`
- Modify: both guides `index.md`, `apps/docs/docs/product/platform.md` and `manager.md` and their ES twins (one sentence and a link each), `docs/superpowers/specs/2026-10-16-ui-foundations-design.md` (Roadmap: delivery 3 Cases and Responses as tables, delivery 4 Help, Places, Approvals, Forms)

The guide holds: the page layout; the table rules; how the range and place drive the band and the table's date window while chips and search narrow only the table; every column of Cases and Responses in plain words; the tab counts (server-side, whole window) and the 200 cap note; negative share and "not read"; the case page and the response drawer; the address as the state (sharing a filtered view); what is not there (export, bulk actions, column chooser). Match the style of `reading-the-overview.md` and keep EN and ES identical in facts.

- [ ] **Step 1: Write the two pages and the edits.**
- [ ] **Step 2: Build the docs.** `bun run --filter @atrium/docs build`. Expected: success in EN and ES, no broken links.
- [ ] **Step 3: Commit** `docs(ui): tables and section pages, EN and ES`.

---

### Task 11: Verify in the browser and run CI

**Files:** none (a check; fixes are new commits through implementers).

- [ ] **Step 1: Bring everything up** (Postgres, `bun run seed:history` already applied or run it, API 3001, Manager 3002, Platform 3003 with `set -a; . ./.env.local; set +a`), log in as the demo account manager and as a history owner (emails from the seed output).
- [ ] **Step 2: Walk Cases and Responses in both apps** at 1440px and at a narrow width (DevTools device mode): the band is about a third of the viewport; the table is full width, rows are one line, truncation shows `…` with a title; sorting each header; every tab and filter; search with `%` and `_`; pagination; the footer text; the drawer (keyboard: Enter on a row, Escape, focus returns); the case page and the bell link; an old `?case=` link; range 7D/30D/90D changes band and table together; the band error state (stop the API for a moment); lime appears once per page; nothing overflows.
- [ ] **Step 3: Run the whole CI:** `bun run ci`. Expected: lint, deps, typecheck and all tests pass (the known unrelated `flow.test.ts` failure must be fixed or ruled before this step is called green).
- [ ] **Step 4: Fix what the walk found**, test first, one commit per fix, and re-run Step 3.
