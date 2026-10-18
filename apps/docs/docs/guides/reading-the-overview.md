---
sidebar_position: 3.6
title: "Reading the Overview"
description: "What the two Overview pages answer, how every figure is defined, and what is not there yet."
---

# Reading the *Overview*

The Platform and the Manager each open on an Overview. They share the same pieces (a figure with its change and trend, a trend chart, ranked bars, a queue) and read the same data: answers, cases, review requests, approvals and places. Nothing is precomputed; every figure is read from the database when the page loads.

| App | Who | The question it answers |
| --- | --- | --- |
| Platform | The owner of a client | How is my business doing, and what needs me? |
| Manager | An account manager or agency staff | What in my portfolio needs a person now? |

The data comes from `GET /api/insights/owner` and `GET /api/insights/agency`. The first needs a client session, the second an agency session (an agency role, or an assigned account manager); anyone else gets a 403. Row-level security decides which places and clients a person sees, so a person only ever gets their own numbers.

## Range and place

Both pages have a range (`7D`, `30D`, `90D`) and a select: **Place** on the Platform, **Client** on the Manager. The default is `30D` and all places or all clients.

Both choices live in the address (`?range=30d&place=<id>` on the Platform, `?range=30d&client=<id>` on the Manager). A link can be shared and the back button works. A place or client outside the person's scope finds nothing.

Every figure is compared with the window right before it, of the same length: 30D is compared with the 30 days before it.

Days are each place's own local calendar days, from `core.locations.time_zone`. A window is the last N local days of that place, ending today. When the page adds several places, it sums by local date, so a point on a chart is a calendar date, not an instant. "Updated" at the foot of the page shows the time in the viewer's browser time zone.

## The small-sample rule

A figure from few answers says nothing, so it is not dressed up as a trend. The rule lives in one function and every tile and table uses it.

- With fewer than **10 answers** in the window, a tile shows "Too few answers (n)" instead of a change or a trend, and a table cell shows a dash. The Platform's rating chart is left empty.
- A **change** also needs 10 answers in the previous window. Without them the change is a dash, even if the current window is large enough.
- For rates, the count that must reach 10 is the denominator: answers for the review link rate, requests sent for the answer rate, cases opened for time to contact.

## Definitions

**Average rating.** The mean of the star rating over answers created in the window.

**Portfolio rating.** The mean over all answers of all clients, so it is weighted by answers. It is not the mean of the clients' means: a client with 200 answers counts for more than one with 12.

**Change.** This window minus the previous one. It is written in three units, and the arrow is accompanied by a word ("up", "down", "no change") so it never relies on colour alone:

- **Rating points**, for a rating (`0.2 pts` is a fifth of a star).
- **Percentage points**, for a rate (the answer rate going from 40% to 50% is `10 pts`).
- **Percent**, for a count (answers this window against the previous window).

Whether up is good depends on the figure. More overdue cases is bad, so it is shown as clay when it rises.

**Responses.** The number of answers created in the window. Its change is in percent.

**Answer rate.** Of the review requests sent in the window (status `sent`), the share whose invitation was used by an answer. Scheduled and skipped requests are not counted. On the Platform it appears as a note under Responses ("N% of M requests answered"); on the Manager it is a tile. The Platform note has no 10-answer rule.

**Review link click rate.** Answers with a recorded click on the review link, divided by **all** answers in the window. It is not divided by happy guests: the Hub offers the review link to every respondent whatever the rating, so the honest base is every answer. The Platform tile shows the click count, with the rate as a note.

**Time to contact.** For cases opened in the window, the time between opening and the first contact. The tile shows the **median** of the cases already contacted, the target (24 hours) and the **share inside the target**. A case counts as inside the target when it was contacted by its due time. A case not yet contacted counts as outside the target only once its due time has passed; before that it is not judged. The change is in hours ("faster" or "slower").

**Overdue and Due.** A case is *overdue* when it is open and its due time has passed. It is *due* when it is open and due within the next 24 hours. A case already contacted or resolved is neither. The Manager's "Overdue cases" tile shows the count now and, as a note, how many were overdue one window ago. There is no status history, so that earlier number is read back from the timestamps and is an estimate.

**Waiting on you.** (Platform) The open cases of the client, and how many are past the 24-hour target.

**What guests mention.** (Platform) Each answer carries one sentiment and a list of topics. The sentiment of a topic is the sentiment of the answers that mention it: "Wait time: 72% negative" means 72% of the answers that mention wait time were read as negative. An answer that mentions two topics counts once under each. The neutral bucket holds everything that is neither positive nor negative, `mixed` included. The block shows the five topics mentioned most.

**What Host did.** (Platform) Three counts for the window: requests sent, cases opened (every case is opened by the system) and answers read, meaning answers that have been marked as read.

## The Platform Overview

From top to bottom:

1. **Four tiles.** Average rating, Responses, Review link clicks and Waiting on you. Waiting on you is the lime block.
2. **Rating over time** and **What guests mention**, side by side.
3. **Your places** and **What Host did**.

**Your places** lists each place with its rating and change, answers and open cases (with how many are overdue). It is sorted by what needs attention: most overdue cases first, then the lowest rating, then the name. A place with fewer than 10 answers shows a dash for the rating.

## The Manager Overview

From top to bottom:

1. **Needs a person now**, the queue.
2. **Four tiles.** Median time to contact, Overdue cases, Portfolio rating and Request → answer rate.
3. **Your clients**, one row per client.

**The queue** holds four kinds of item:

| Kind | What it is | Opens |
| --- | --- | --- |
| Case | An open case that is overdue or due within 24 hours | `/reputation/cases?case=<id>` |
| Approval | A request waiting for the agency's OK | `/approvals/places` |
| Account | A request to join, not yet reviewed | `/approvals/accounts` |
| Place to activate | A place waiting for approval | `/approvals/places` |

It shows at most **8 rows**: cases first (overdue before due, then by due time), then approvals, accounts and places. When there is more, a footer links to each list ("N more cases", "N more accounts", "N more places"), because there is no single queue page. Account requests belong to no client yet, so they appear only when no client is selected, and only for agency roles with the `location: manage` permission; an assigned account manager sees none because of row-level security. When there is nothing to show, the block says "Nothing needs a person right now".

**Your clients** shows, per client: rating, a trend line, change, responses, answer rate, overdue cases and a status. The status is one of:

- `Needs a person`: the client has at least one overdue case.
- `Setting up`: a place of the client is still pending.
- `Healthy`: neither.

Clients are sorted by most overdue cases, then by name. A client with fewer than 10 answers shows a dash for the rating and "Too few answers" in place of the trend.

## What each block links to

Every tile and block opens the page that explains it, with the range and the place or client in the address.

| Block | Opens |
| --- | --- |
| Platform: Average rating, Responses, Review link clicks | `/reputation/responses?range=…&place=…` |
| Platform: Waiting on you | `/reputation/cases`, or `/reputation/cases?status=overdue` when something is overdue |
| Platform: a topic | Responses with `&topic=<topic>` |
| Platform: a place | Responses for that place |
| Manager: Median time to contact | `/reputation/cases` |
| Manager: Overdue cases | `/reputation/cases?status=overdue` |
| Manager: Portfolio rating, Request → answer rate | `/reputation/responses?range=…&client=…` |
| Manager: a queue row | The case, approval, account or place it is about |

The Cases and Responses pages honour only the filters they have today and ignore the rest. The link still goes to the right page.

## When the page cannot show a number

- **No reading yet.** The block "What guests mention" says "No reading yet for these answers" when no answer in the window has a sentiment or topics. The Sentiment reading comes from the agents service, so it is absent when that service is off or has not read the answers yet. The rest of the page does not depend on it. When answers were read but none mentioned a topic, the block says "No topics came up in this period".
- **No data yet.** A tile with no answers in the window says so, and shows a dash.
- **Could not load.** If the request fails, the page shows "Could not load the overview" and a Retry button.

## Demo history

The demo database holds a handful of answers, which is too little to see a chart. `bun run seed:history` adds 90 days of believable history on top of it: three extra demo clients, four places in four time zones, answers, review requests and cases, with a slow rise, a dip at one place, a topic that is mostly negative, a client with fewer than 10 answers and an overdue case.

- It is deterministic: the same data every time.
- It is idempotent: a client that already has answers is skipped, so a second run adds nothing.
- It is for development only. It does not touch the existing demo client or the default `seed`. Run `bun run db:migrate` (and normally `bun run seed`) first.
- It prints the demo emails and the sign-in at the end.

## Not there yet

- Metrics from signals (impressions, calls, orders), engine scores, the Growth Score and the benchmark against the 10-mile radius. No source feeds them on these pages yet.
- Custom date ranges. Only 7, 30 and 90 days.
- Export, scheduled reports and saved views.
- An event feed of what Host did. Today it is three counts.
- Live updates. The page loads once; reload to refresh.
