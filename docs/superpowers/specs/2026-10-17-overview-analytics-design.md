# Overview and analytics: how Atrium shows its data

Date: 2026-10-17
Status: draft for review
Delivery 2 of the UI redesign. It replaces the earlier roadmap order (Cases was 2, Overview was 3): the Overview is what bothers the user most today, and it fixes the patterns that Cases, Responses and Places then reuse.

## Goal

Replace the two Overview pages (four bare counters each) with pages that answer one question for one audience, and give every later data screen a shared set of pieces: a range and place selector, a figure with its change and trend, a trend chart, a ranked breakdown, and a queue.

The user's words: the way data is presented "does not convince me at all". The direction was shown as a mockup (`.superpowers/brainstorm/88628-1792268279/content/overviews-pirsch-atrium.html`) and approved with "vamos bien encaminados". Style is the Pirsch × Atrium hybrid already in `2026-10-16-ui-foundations-design.md` (revision of 2026-10-17).

## What was asked, and what I assumed

Asked: think about best practices for data analysis and dashboards, given the data models and the usability of the system.

Agreed in the session:
- Two audiences, two Overviews. The owner (Platform) asks "how is my business doing and what needs me?". The account manager (Manager) asks "what in my portfolio needs a person now?".
- Every figure carries its change against the previous period and a small trend. Never a bare number.
- One range selector (7D, 30D, 90D) and one place selector, in the page header, driving the whole page and kept in the address.
- The agency's page leads with a queue of things that need a person, before any average.
- Every figure and block opens the table that explains it.
- Each shape for its job: a line for trend, bars to compare, a stacked bar for a split, a table to act. No pies.
- Honest data: a small sample is said to be small, and each page says when it was updated.

My calls (the user can overrule):
- **Scope is what exists today:** Reputation data (answers, cases, review requests, approvals, places). Signals-based metrics (impressions, calls, orders), engine scores, the Growth Score and the 10-mile benchmark are out: no source feeds them yet.
- **Two fixed windows, no custom range.** 7, 30 and 90 days, each compared with the immediately preceding window of the same length.
- **The "What Host did" block is a three-line summary of counts** (requests sent, cases opened, answers read in the window), not an event feed. An event feed needs a defined audit view and is a later delivery.
- **Review-link clicks are measured against all answers**, not only happy guests. The Hub offers the review link to every respondent (`submitSurvey` returns `reviewUrl` whatever the rating), so "clicks ÷ answers" is the honest rate. The mockup said "of 96 happy guests"; that wording is wrong.
- **Topic sentiment is per answer.** `survey_responses` stores one `sentiment` and many `topics`. "Wait time: 72% negative" means 72% of the answers that mention wait time were read as negative, and the block says so in its hint.

## Where things are today

- `packages/ui/src/shell/overview.tsx` fetches `cases`, `surveyResponses`, `onboardingRequests` and `places` and counts them in the browser. There are no aggregate endpoints.
- `packages/ui` already has `StatTile`, `Delta`, `Sparkline`, `BarChart`, `LineChart`, `ScoreRing`, `DataTable`, `FilterBar` and `useTableState`.
- The API mounts per-area routes (`cases.ts`, `surveys-admin.ts`, `locations.ts`, `notifications.ts`) and runs every query through `withScope(db, scope, tx => ...)`, which applies the person's tenancy.
- Tables that matter: `reputation.survey_responses` (rating, sentiment, topics, concern, safety, wants_contact, review_clicked_at, created_at, location_id), `reputation.recovery_cases` (opened_at, due_at, contacted_at, resolved_at, status, severity), `reputation.review_requests` (status, sent_at, send_at), `reputation.survey_invitations`, `core.locations` (name, time_zone, status), `core.approval_requests`, `core.onboarding_requests`.
- The demo database holds 3 answers and 3 cases. A chart cannot be designed or tested on that.

## Design

### 1. The shared pieces (in `@atrium/ui`)

All follow the product theme (cream, ink outline, no shadow, lime as the one accent, clay for what is wrong).

- **`PageControls`**: the range segmented control (7D, 30D, 90D) and a place select. Both live in the address (`?range=30d&place=<id>`), through the same mechanism as `useTableState`, so a link can be shared and Back works. Default 30D and all places.
- **`KpiTile`** (extends `StatTile`): label, serif figure, `Delta`, a `Sparkline` or mini bars, one note. It can be a link. It has two extra states: *too few answers* (shows the count and no delta or trend) and *no data*.
- **`TrendChart`**: a line for the daily average with the day's volume as bars behind it, a hover or focus readout, axis labels, and a visually hidden table with the same numbers.
- **`SplitBars`**: ranked rows, each a stacked bar of positive, neutral and negative, with a count. A row is a link.
- **`QueueTable`**: built on `DataTable`. Columns: kind, who, detail, when, action. A row links to its target, using `notificationHref`-style targets.
- **`UpdatedStamp`**: "Updated 10:42 · compared with the previous 30 days".

Rules shared by all:
- A delta is written in words as well as arrows ("up 0.2", "down 3 points"), and uses lime or clay with a mark, never colour alone. Whether up is good is a property of the metric (more overdue cases is bad).
- **Small samples:** a trend or a delta needs at least 10 answers in the window, and for a delta also in the previous window. Below that the tile says "Too few answers (n)". Tables show "—".
- Every chart has a text alternative.
- Layout works from 390px: figures stack two by two, then one by one; tables scroll with the first column pinned.

### 2. The owner Overview (Platform)

Order, top to bottom:
1. Header with `PageControls`.
2. Four tiles: **Average rating** (change, trend), **Responses** (change, daily bars, "N% of requests answered"), **Review link clicks** (clicks ÷ answers, change in points), **Waiting on you** (open cases, how many overdue; this tile is the one lime-washed block, and links to Cases).
3. **Rating over time** (`TrendChart`) next to **What guests mention** (`SplitBars` by topic, top 5, with the per-answer hint). If the Sentiment reading is off or empty, the block says so instead of vanishing.
4. **Your places** table (rating, change, responses, open cases), sorted by what needs attention; and **What Host did** (the three-line summary).

### 3. The agency Overview (Manager)

1. Header with `PageControls` (place select becomes a client select).
2. **Needs a person now**: the `QueueTable` of overdue and due cases, approvals waiting, accounts and places to activate. Overdue first, then by due time. Capped at 8 rows, with a footer of links per kind ("N more cases", "N accounts", "N places"), because there is no single queue page. Empty state: "Nothing needs a person right now".
3. Four tiles: **Median time to contact** (against the 24h target, with the share inside target), **Overdue cases**, **Portfolio rating** (weighted by answers), **Request → answer rate**.
4. **Your clients** table: rating, 30-day trend, change, responses, answer rate, overdue cases, status. Status is derived: *Needs a person* (any overdue case), *N approvals waiting*, *Setting up* (a place pending), *Healthy*. Sorted by that order. A client under 10 answers shows no trend.

### 4. Where the numbers come from

New read-only API routes, one per audience, each through `withScope`, so the person's tenancy decides what they can see. The agency view never leaks into the client app's route (rule from the dashboard-shell spec).

- `GET /insights/owner?range=30d&place=<id>`: tiles, daily series, topic split, places table, Host summary.
- `GET /insights/agency?range=30d&client=<id>`: queue, tiles, clients table.

Both return the window dates and a `generatedAt`. Aggregation is SQL over the tables above; nothing is precomputed or stored, because the volumes are small. Days are bucketed in each place's time zone (`core.locations.time_zone`). The builder checks whether an index on `(location_id, created_at)` is needed.

Definitions, fixed once and used in both routes and in the docs:
- **Average rating**: mean of `rating` over answers created in the window. Portfolio rating is the mean over all answers, not the mean of client means.
- **Change**: this window minus the previous window; null below the small-sample rule.
- **Answer rate**: answers whose `invitation_id` came from a review request sent in the window, divided by review requests sent in the window. The builder confirms the join and records any case it cannot attribute.
- **Review click rate**: answers with `review_clicked_at` set, divided by answers.
- **Time to contact**: `contacted_at - opened_at` for cases opened in the window; the median, and the share with `contacted_at <= due_at`. A case not yet contacted counts as outside target only once past `due_at`.
- **Overdue**: `due_at` passed and status not contacted or resolved.

### 5. Demo data

A `seed:history` script (dev only, deterministic, seeded random generator) adds 90 days of answers, cases and review requests across at least two clients and four places, with believable shape: a slow rise, a dip at one place, a topic that is mostly negative, one client with fewer than 10 answers, one overdue case. The default `seed` is unchanged. Tests do not depend on it; they build their own fixtures.

### 6. Links from the Overview

Each tile and block links to its page with the filters in the address (`/reputation/responses?range=30d&place=...&sentiment=negative&topic=wait-time`, `/reputation/cases?status=overdue`). Until the Responses and Cases data pages are rebuilt (later deliveries) they honour only the filters they have today and ignore the rest; the link still goes to the right page.

### 7. Settled during review

Answered by the code, not by guessing:
- **Who sees what.** The session's `scope.kind` decides. `/insights/owner` needs `kind: "client"` and is shaped by that person's client; `/insights/agency` needs `kind: "agency"` (roles `account_manager`, `agency_staff`) and is shaped by the clients assigned to them. Both go through `withScope`, so row-level tenancy does the filtering and the route only adds a role check (403 otherwise). `client=<id>` is a `core.clients.id` and is honoured only if it is inside the person's scope. The owner's place select is `core.locations` in scope (the `/locations` route already lists them).
- **Answer rate join.** `survey_responses.invitation_id` and `review_requests.invitation_id` both exist. Numerator: answers whose `invitation_id` matches a review request. Denominator: review requests with `status = 'sent'` and `sent_at` in the window. Skipped and scheduled requests are not counted.
- **Case states.** `recovery_cases.due_at` is never null. A case is *overdue* when `status = 'open'` and `due_at` has passed (`isOverdue` in `modules/reputation/domain/recovery.ts`); a case is *due* when open and due within 24 hours.
- **Queue sources and targets.** Cases (`recovery_cases`, open), approvals (`core.approval_requests`, `status = 'pending'`), accounts to activate (`core.onboarding_requests`, `status = 'open'`) and places to activate (`core.locations`, `status = 'pending'`). Targets that exist in the Manager today: `/reputation/cases`, `/approvals/accounts`, `/approvals/places`.

My calls, made here and open to the user's overruling:
- **Time zones.** Each place's days are its own local calendar days. An "all places" series sums by local date, so a point is a calendar date, not an instant. The window is the last N local days for each place. "Updated" shows in the viewer's browser time zone.
- **No flag for the Sentiment reading.** The API cannot see whether the agents service is on. The topic block shows its message when no answer in the window has a `sentiment` or `topics` value ("No reading yet for these answers"), and otherwise draws.
- **"Answers read"** in the Host summary means answers with `read_at` set. **"Cases opened"** means `recovery_cases.opened_at` in the window; every case is opened by the system, so it does not separate people from Host.
- **`seed:history`** creates its own demo clients (found by slug, so re-running does nothing twice) and does not touch the existing demo client.
- **Left to the builder:** whether `useTableState` can carry `range` and `place` or a sibling hook is cleaner, and whether an index on `(location_id, created_at)` is needed.

## Testing and docs

- Pure aggregation functions tested against hand-built fixtures: windows, previous window, the small-sample rule, the median, time-zone day buckets, weighted portfolio rating.
- API: each route per role; a client cannot read another client's numbers (tenancy); the agency route is refused to a client session and the reverse.
- UI: `KpiTile` too-few-answers and no-data states, delta words and direction, `PageControls` round-trip through the address, `TrendChart` text alternative, `SplitBars` link rows.
- Docs, EN and ES: a guide page "Reading the Overview" with every definition above, and an update of the Platform and Manager product pages.
- Visual check in the browser on both apps with the history seed, at 1440px and at 390px, with screenshots reviewed.

Done means: CI green, docs build in both languages, and the two Overviews reviewed in the browser on the history seed.

## Out of scope

- Signals-based metrics, engine scores, Growth Score, the 10-mile benchmark.
- Custom date ranges, export, scheduled reports, saved views.
- An event feed of what Host did.
- Rebuilding the Cases, Responses, Help and Places pages (deliveries 3 and 4).
- Real-time updates; the page loads once and has a refresh.

## Risks

- **The Sentiment reading can be absent** (it needs the agents service and a model). Topic and sentiment blocks must degrade to a plain message; the rest of the page must not depend on them.
- **Answer-rate attribution.** If requests and invitations cannot be joined cleanly, the rate is wrong. Mitigation: confirm the join first and write a test on a fixture; if it cannot be made exact, show only the count sent and the count answered.
- **Small samples read as trends.** Mitigation: the 10-answer rule is in one shared function, used by tiles and tables, with a test.
- **Aggregation cost** grows with answers. Mitigation: windows are bounded to 90 days and indexed; measure before adding any storage.
