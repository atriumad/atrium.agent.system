# Data tables: a summary band on top, a conventional table below

Date: 2026-10-18
Status: draft for review
Deliveries 3 and 4 of the UI redesign. It replaces the roadmap lines "Cases" and "Responses, Help and Places" of `2026-10-16-ui-foundations-design.md` and builds on delivery 2 (`2026-10-17-overview-analytics-design.md`), which must be merged first.

## Goal

Every section page that lists things (cases, responses, help requests, places, approvals, forms) becomes the same page: a short overview band at the top, and under it a conventional full-width table with filters, sorting, pagination and a row that opens the detail. The user can see reviews, cases and requests at a glance, one row each, instead of reading a stack of cards.

The user's words: "the current table format is badly thought out"; "conventional tables where we can see reviews, cases, everything at a glance"; and, after seeing the mockup (`.superpowers/brainstorm/42238-1792334932/content/tables-conventional.html`), "it is valid to have a section at the top of each page, about a third of the page height, with an overview, and below it the table with pagination".

## What was asked, and what I assumed

Agreed in the session:
- One table pattern for all lists: one row is one line; the first column is the identity and the real link of the row; numbers on the right in tabular figures; states always with a word; texts cut with an ellipsis and readable in full on hover and in the detail; sticky, sortable header; filters as chips plus search; a count ("8 of 107"); pagination under the table; filters, sort and page in the address.
- A summary band at the top of every section page, about one third of the viewport height, with an overview of that section. The table sits below it, with its own pagination.
- Style: the Pirsch × Atrium product theme already shipped (cream, ink outline, no shadow, lime as the one accent).

My calls (the user can overrule):
- **The band follows range and place, not the table's filters.** A `PageControls` (7D, 30D, 90D and a place select, from delivery 2) at the page header drives both the band and the table's date window. The chips, search and column filters narrow only the table. This avoids a band that changes while someone searches.
- **Paging runs on the server only for Responses.** It is the one list that grows without bound (hundreds per month per place). Cases, Help, Places, Approvals and Forms are small and keep client-side filtering and paging over the full list (the API already returns up to 200 rows for each; when a list reaches that cap the page says "Showing the latest 200").
- **Case detail gets its own page** (`/reputation/cases/<id>`), as decided in delivery 1, and the bell and notification links move from `?case=<id>` to that route. **A response opens in a side drawer**, not a page: it has nothing to act on except "Open case", and a drawer keeps the table in place.
- **No bulk actions and no column chooser** in this delivery. The third mockup option (selection and batch actions) was offered and is not chosen; selection can be added later because `DataTable` already supports it.
- **CSV export is out.** The mockup showed an "Export CSV" button on Responses as a placeholder. Guests' comments are third-party data and exporting them needs per-role rules; the button is not built.
- The Cases and Responses sections use the **same query for client and agency** (row-level security shapes the data); the audience-specific Overview rule of delivery 2 does not apply here because the question and the rows are the same.
- Delivery split: **Delivery 3** is the shared pieces plus Cases and Responses (it needs API work). **Delivery 4** is Help requests, Places, Approvals (accounts and places) and Forms & QR, which need no new aggregate API beyond small summary counts. This spec covers both; the plan for delivery 3 comes first.

## Where things are today

- `packages/ui` ships `DataTable` (sort, selection, loading and empty states, row links, client paging of 25), `FilterBar`, `useTableState` (search, filters, sort, page in the address), `Pager` behaviour inside `DataTable`, and from delivery 2 `PageControls`, `useRangeState`, `KpiTile`, `TrendChart`, `SplitBars`, `Delta`, `UpdatedStamp`. Notifications is the only page already on the data page pattern.
- Cases (`CasesPage` in `cases-app.tsx`), Responses, Help requests (`surveys-app.tsx`), Places (`places-panel.tsx`), Approvals accounts and places (`approvals-app.tsx`) and Forms are lists of rows inside a `ListPanel` or cards, with a detail beside or below.
- The API lists: `/api/cases` (200 rows, `status` filter), `/api/surveys/responses` (200 rows, `maxRating` filter), `/api/surveys/requests`, `/api/locations`, onboarding and approval lists. The response and case rows do not carry the sentiment, topics, concern or safety fields that exist in `reputation.survey_responses`.
- The shared pieces for a band exist (`KpiTile`, `TrendChart`, `SplitBars`, `BarChart`), plus the Overview's definitions for ratings, change units and the small-sample rule.

## Design

### 1. The page template

`DataSectionPage` (in `@atrium/ui`, `packages/ui/src/data/`), props: `title`, `description`, `controls` (the `PageControls` node), `band` (a node), `tabs` (optional chip tabs with counts), `filters` (the `FilterBar` configuration), `table` (the `DataTable` configuration), `footerNote`. Layout, top to bottom:

1. Header: title and description on the left, controls on the right.
2. **Band:** a card row of `clamp(14rem, 30vh, 20rem)` minimum height: on wide screens a left block of 3 or 4 `KpiTile`s and a right block with one chart or ranked split; below `lg` the blocks stack and the band has no fixed height. The band shows a loading skeleton and an error with Retry of its own, so a slow band does not hold the table.
3. Optional chip tabs (status, quick filters) with counts.
4. `FilterBar` (search, selects, active chips, count "8 of 107", "Clear all").
5. The table framed like a card (ink outline, 16px radius): sticky sortable header, 44px rows, hairline dividers, hover tint, a footer with "Showing 1–25 of 107 · sorted by …" and the pager.
6. `UpdatedStamp` under the page.

Table rules, shared by every table (one `columns` helper per page keeps them consistent):
- Row height 44px, single line, `truncate` with a `title` for the full text.
- First column is the identity and the link; the whole row is clickable (`rowHref`); links inside a row keep working.
- Number columns right-aligned with tabular figures; dates as `Oct 18, 9:40` (viewer's time zone) with the relative form in the title; stars as text (`★★☆☆☆`) with an `aria-label` "2 of 5".
- Every state is a pill with a word and a mark; overdue is clay with the word "overdue".
- Default sort per page (below). Sort, filters, search, page and range live in the address.
- Narrow screens: the table scrolls horizontally with the first column pinned; the band stacks.
- Empty states: "no data" and "your filters found nothing" with "Clear filters" (already built).

### 2. Cases (delivery 3)

- **Band:** tiles *Open* (count, with how many overdue as a note), *Overdue* (goodWhen down, change against the previous window), *Median time to contact* (against the 24h target, same definition as the Overview) and *Resolved* in the window; right block: *Cases opened per day* bars with the severity split as a `SplitBars` (high, medium, low) beside it.
- **Tabs:** Active (open and contacted), Open, Contacted, Resolved, All, with counts for the window.
- **Filters:** search in the guest's comment, severity, place, topic, and "wants contact".
- **Columns:** Severity (pill), Rating (stars), Place (client · place for the agency, place only for a client), What the guest said (comment, cut), Topics (chips), Due (relative, with an `overdue` pill) as the default sort ascending for active cases, Opened, Status (pill).
- **Row link:** `/reputation/cases/<id>`.
- **Case detail page** `/reputation/cases/<id>`: the content of today's side panel (the answer, the guest's contact data where allowed, the timeline, the actions "Mark contacted" and "Resolve" with a note), with a "Back to cases" link that keeps the table's address. `notificationHref` links a case notification to this route.

### 3. Responses (delivery 3)

- **Band:** tiles *Responses* (change in percent), *Average rating* (change in points, small-sample rule), *Negative share* (answers read as negative, in points of change) and *Review link clicks* (against all answers); right block: the *rating distribution*, five horizontal bars (1 to 5 stars) with counts.
- **Tabs / quick filters:** All, 3 stars or fewer, Wants contact, Has a case, Safety (only answers flagged by the reading), each with a count for the window.
- **Filters:** search in comments, rating, sentiment, topic, place.
- **Columns:** Date (default sort, newest first), Rating, Place, Comment (cut), Sentiment (pill; a dash when there is no reading), Topics (chips), Contact (Yes or dash), Review (a check if the review link was clicked), Case (link to the case if any).
- **Row action:** opens a side drawer with the full answer (best part, improve, comment), the reading (sentiment, concern, safety), the guest's contact preference and a link "Open case".
- **Server-side:** see section 5.

### 4. Delivery 4 sections (summary)

Same template, same rules; bands are small.

| Section | Band | Default sort | Columns |
| --- | --- | --- | --- |
| Help requests | tiles: Open, Waiting on you (client) or Waiting on the client (agency), Median first reply, Closed in the window | last activity, newest | Place (client · place), Last message (cut), Waiting on (pill: you / the agency / the client), Status, Opened, Last activity |
| Places (Manager clients/places, Platform my places) | tiles: Active, Pending, Suspended, Average rating | needs attention (pending first), then name | Place, Client (agency only), Status (pill), Time zone, Rating and change, Responses, Open cases |
| Approvals, accounts | tiles: Waiting, Oldest waiting (age), Decided in the window | oldest first | Business, Owner, First place, Requested, Status, action |
| Approvals, places | same | oldest first | Place, Client, Requested by, Requested, Status, action |
| Forms & QR | tiles: Active forms, Missing review link, Manual links created in the window | places missing a link first | Place, Review link set (pill), Send delay, QR version, Status, row actions menu (copy QR link, preview, rotate QR, generate link) |

A row of Approvals and of Forms has actions; they live in a trailing actions cell or menu and never make the whole row a link. Detail pages that exist today (a help thread) stay where they are and become the row link.

### 5. API

All routes are read-only, go through `withScope`, and follow the Overview's rules: `scope.kind` decides nothing for these shared routes; row-level security shapes the data; an unknown `range` is 422 `invalid_range`; an id that is not a UUID is 422 `invalid_id`; an out-of-scope id returns empty results, never 403.

- `GET /api/surveys/responses?range=&place=&q=&rating=&sentiment=&topic=&wantsContact=&hasCase=&safety=&sort=&dir=&page=&pageSize=` returns `{ rows, total, page, pageSize }`. `pageSize` is 25 by default and capped at 100. Filters combine with AND. `q` matches the comment, best part and improve text case-insensitively (`ILIKE`, parameterised, with `%` and `_` escaped). Sort keys: `date`, `rating`, `place`, `sentiment`. Each row adds `sentiment`, `topics`, `concern`, `safety`. The current `maxRating` filter stays working for the existing caller during the migration and is removed with the old page.
- `GET /api/cases` keeps returning up to 200 rows and adds to each row the comment excerpt (first 160 characters) and `topics`; the list also accepts `range` (cases opened or still open in the window). The response gains `truncated: boolean`.
- `GET /api/insights/cases?range=&place=` and `GET /api/insights/responses?range=&place=` return the band data, computed by new functions in `modules/reputation` (pure parts in `domain/insights.ts`, queries in `application/insights.ts`): cases: `open`, `overdue`, `contact` (median hours, share inside target, as in the Overview), `resolved`, `openedPerDay` (the Overview's series shape), `bySeverity`; responses: `responses`, `rating`, `negativeShare` (value 0..1 and change in points), `reviewClicks`, `distribution` (counts for 1 to 5), all with the Overview's small-sample rule and units (rating points, percentage points, percent).
- Delivery 4 bands use small counts computed from the lists each page already loads, except Places and Help which reuse `ownerInsights`/`agencyInsights` figures (rating, response counts) already available; no new aggregate route is planned for them. If a figure needs one, the plan says so.

Definitions are the Overview's (see `reading-the-overview.md`); "negative" means the stored `sentiment = 'negative'`, and an answer with no reading is not counted as negative.

### 6. Testing and docs

- Pure functions (distribution, negative share, the case severity split, ILIKE escaping) with fixtures.
- API: each route per role, tenancy (a client never sees another client's rows; an assigned account manager only assigned clients), filters, sort, paging bounds (`pageSize` above 100 is clamped, `page` beyond the last returns empty rows with the right `total`), `q` with `%` and `_` characters, injection attempt in `q` and `sort` (an unknown `sort` is 422).
- UI: `DataSectionPage` renders band, tabs, filters and table; the band's loading and error states do not block the table; the table rules (truncation with title, first-column link, whole-row click that leaves inner links working, numbers right-aligned, pill words); each page's default sort, filters and address round trip; pagination and "Showing a–b of n"; a response row opens the drawer and the link to its case; the case page and the bell's new links.
- A `use-client` guard already exists; new client components keep it passing.
- Docs, EN and ES: a "Tables and section pages" guide (the table rules, the band, how range and filters interact, what each section shows) and updates to the Platform and Manager product pages and to the roadmap in the UI foundations spec.
- Visual check in both apps with `seed:history`, at 1440px and at a narrow width, with screenshots reviewed.

Done means: CI green, docs build in EN and ES, and the pages reviewed in the browser.

### 7. Settled during review

Answered by the code:
- **Case rows already join the answer.** `listCaseSummaries` joins `survey_responses` on `response_id`, so the comment excerpt, `topics`, `sentiment` and `safety` come from that join; no new table. Topics and sentiment are `null` for an answer that was never read: the column shows a dash, and the topic filter matches read answers only (its label says "Topic (read answers)" and the table's footer says how many rows were not read).
- **Whole-row click already exists.** `DataTable` (delivery 1) makes the first cell a real link and the whole row its click target while inner links and buttons keep working; the shared-pieces task only has to use it.
- **Delivery 2's pieces are final** and `application/insights.ts` already has the pure and query parts split (`domain/insights.ts`), so the new band functions follow the same shape.
- **The detail route lives in both apps.** `CaseDetailPage` is one shared component in `@atrium/ui`; the Manager and the Platform each add a route file for `/reputation/cases/<id>` (the Platform's feedback section is `/reputation/feedback`, so its route is `/reputation/feedback/<id>`; the plan confirms the exact paths from the apps' navigation). `notificationHref` is shared, so both apps' links change together. The old `?case=<id>` is read and redirected to the new route keeping every other query parameter. "Back to cases" goes back in history and falls back to the list with the table's address.
- **Client name.** Rows carry `clientName` for every role (a client sees only its own name, which is not sensitive); the Place column shows "client · place" only when the viewer is not a client (`me.kind !== "client"`). The guest contact data in the case detail is exactly what today's panel shows; nothing about it changes.

My calls, made here:
- **Counts come from the server, not from counting loaded rows.** `GET /api/cases` returns `{ cases, counts: { active, open, contacted, resolved, all }, truncated }`, with the counts computed over the whole window, so the tabs stay right when more than 200 cases exist. "In the window" means opened in the window, or still open or contacted whenever it was opened. The default range is 30d. The band's *Open* and *Overdue* are "now" figures, not windowed, and equal the Active tab's count and its overdue subset.
- **Negative share** is the share of *read* answers (those with a `sentiment`) in the window that are negative; its change is null unless at least 10 answers were read in both windows. The Safety tab shows 0 when nothing is flagged or nothing has been read. The tile's note says "of N answers that were read".
- **Delivery 4 bands, trimmed to what the data can give:** Help requests: Open, Waiting on you (or on the client), Waiting longest (age of the oldest request that waits), Closed in the window (no "median first reply": there is no first-reply timestamp). Forms & QR: Active forms, Missing review link, Pending places (no "manual links created": there is no source). Places: Active, Pending, Suspended, Average rating; the Manager's Places table needs per-place rating, change, responses and open cases, so delivery 4's plan adds a `places` array to `agencyInsights` (the owner's `ownerInsights.places` already has it).

## Implementation notes (delivery 3)

Where the build differs from the design above. The guide `apps/docs/docs/guides/tables-and-section-pages.md` documents the code.

- **`place` on `GET /api/cases`.** The route takes a `place` parameter (422 `invalid_id` when it is not a UUID) and applies it in SQL to the rows, the tab counts and `truncated`. The design filtered the place in the browser.
- **`back` on case URLs.** A row links to `/reputation/cases/<id>?back=<the table's query string>` (the table's search plus `range` and `place`), so "Back to cases" restores the table. Only a plain query string up to 500 characters is accepted.
- **Tab counts and "Active".** `counts` come from the server over the whole window and place. The band tile "Active" (open plus contacted, now) equals the Active tab; the tab "Open" is open only.
- **`hideBelow`.** Columns carry a `hideBelow` breakpoint: Cases hides Opened below `xl` (1280px) and Topics below `2xl` (1536px); Responses hides Topics below `2xl`.
- **Debounce.** The Responses search is sent 300 ms after the last key (immediately when emptied); it is trimmed and cut to 200 characters. Cases search stays in the browser, over the comment excerpt.
- **Sentiments.** The contract's values are `positive`, `mixed` and `negative`. The "neutral" in the mockups means `mixed`.
- **Full width.** The app frame no longer caps the content width; every page uses the full width.
- **Responses search** matches the comment, the best part and what to improve (as designed); the sentiment sort ranks the stored value `neutral`, which the contract does not have, so `mixed` answers sort with the unread ones.

## Out of scope

- CSV export, bulk selection and actions, a column chooser, a density switch, saved views.
- Server-side paging for anything but Responses.
- Cross-section search.
- Charts of signals-based metrics.
- Changing a case's workflow (contacted, resolved) or the help thread's behaviour.

## Risks

- **Response volume.** Server paging is built only for Responses; if Cases or Help grow past 200 rows the cap shows and a later delivery moves them to the server. Mitigation: the "latest 200" note and `truncated` flag.
- **Search cost.** `ILIKE` over comment text without an index is fine at today's volume; measure before adding a trigram index.
- **Sentiment is optional.** Rows without a reading show a dash; the sentiment filter must say how many rows it cannot classify, and the "Negative share" tile must say what it is based on ("of the answers that were read").
- **The band and the table can disagree** if a person expects the band to follow the chips. Mitigation: the band's title states "for the last 30 days" and the page says once, under the controls, that filters apply to the table.
- **Link churn.** Moving the case detail to a route changes notification links and any saved `?case=` links. Mitigation: keep reading `?case=<id>` and redirect it to the new route.
