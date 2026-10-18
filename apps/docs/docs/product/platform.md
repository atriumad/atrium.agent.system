---
sidebar_position: 2
title: "Platform"
description: "The client's web dashboard: sections, what each shows and the build phase of each."
---

# Platform: the client's *Growth OS*

The Platform is where the restaurant sees its growth: the map, the score and what moves it. It has a location switcher, a date range (7, 30, 90 days or custom), a toggle to compare against the 10-mile radius, an export, and a "synced via N8N" line showing the freshness of each source.

## Sections and phases

| Section | Engine | What it answers | Phase |
| --- | --- | --- | --- |
| Dashboard | All five | Your growth at a glance: the map, the score and what moves it | V1 |
| Discoverability | Discoverability | Set up to be found: GBP, local SEO, search and your site | V1 |
| Attention | Acquisition | Content worth watching, produced and delivered on time | V1 |
| Reputation | Reputation | More reviews, a higher rating | V1 |
| Attribution | Cross-engine | Where every guest and action came from | V2 |
| Retention | Retention | Every conversation answered, every guest brought back | V2 |
| Growth | Growth | Paid ads, planned, produced and managed live | V2 |
| Management | — | Tasks and messages with your Atrium team: approvals, calendar, library | V2 |
| Benchmarks | — | Every competitor stat we compare you against | V3 |
| Reporting | All five | The wins and the data from every engine, in one story | Always on |
| Settings | — | Organization, sources, team | Always on |

The navigation groups them as Dashboard · Engines (Discoverability, Attention, Retention, Reputation, Growth, Reporting) · Insights and team (Benchmarks, Management) · Account (Settings). The labels "Attention" and "Reputation" are the Platform names for the Acquisition and Reputation engines.

The owner's Overview answers "how is my business doing, and what needs me?" with the rating, responses, review link clicks and open cases, each with its change; every definition is in [Reading the Overview](../guides/reading-the-overview).

## What each section contains

### Dashboard

- **Growth Score:** 0–300 with the delta over the selected range and the 10-mile average beside it; the five engine scores underneath, each with an amber tick for the radius average.
- **Brand awareness map:** unprompted awareness by neighborhood zone from the quarterly brand survey, with the radius average. Zones are High at 40%+, Growing at 15–39% and Target under 15%.
- **Growth Score momentum:** 12 weeks. **Share of voice** against the top competitors in the radius, estimated from tracked local reach and engagement.
- **Wins:** the moments worth celebrating, auto-surfaced by an agent (best post of the month, a story that drove directions, an email still opened).
- **Guest journey:** attention → consideration → buying intent with conversion against the radius, and a breakdown by source.
- **Biggest lever right now** and **what we're working on.**

### Discoverability

- **Ecosystem:** everything wired to one hub (GBP, listings, site, pixel, hub).
- **Setup readiness:** 0–100 against the radius. Every item is worth points based on the services that run; they add up to the score.
- **Listings:** sync status per directory (Google Business Profile, Apple Maps, Yelp, Facebook, TripAdvisor, Bing Places) and **GBP actions** (profile visits, directions, calls, link clicks).

### Attention (Acquisition)

- **Attention score** with the points ahead of the radius; **how people found you** by stage; where attention comes from, per channel.
- **Content that got you seen:** top posts of the period.
- **Channel → stage → outcome:** every action traced to the channel that earned it.
- **Three stages:** awareness (impressions, platform split, top content), consideration (engagement, website sources) and buying intent (where it lands).
- **Impressions share** against nearby competitors, and the **signal sources** library: what is live and what is planned.

### Reputation

- **Reputation score,** Google rating with the radius average and the star trend, **review velocity**, rating distribution, where reviews land.
- **Review feed** with reply status; **comments and engagement** answered; **survey system:** QR codes on table tents and receipts, with the private channel offered alongside the Google review button for everyone.
- **Reputation across platforms** and the **themes** guests talk about.

### Retention

- **Where they come from:** opt-in sources (WiFi portal, QR survey, online order and reservation checkouts), each becoming a retention audience.
- **Who they are:** the guestbook from the Toast CRM, with segments and lifecycle (new → regular → VIP, win-backs).
- **What we're doing:** campaigns and always-on automations with results, **cohort retention** by month since first visit, and **channel performance**.

### Attribution

- **The journey we earned:** stranger → regular, counted at every step, with the delta against the prior period.
- **Source → journey → outcome:** every guest traced to the work that earned them, grouped as Organic, Paid and Owned. The three table options for channel → stage → outcome are in [Storage and pipeline](../data/storage-and-pipeline#attribution-views).
- **Top customer drivers** and **channel mix.** **Return on the work** is secondary: verified revenue and blended ROAS. **Cost per acquired action** against the radius.

### Growth

- **Always-on:** the three buckets where every standing ad dollar lands (on-premise, estimated; online orders; reservations), each with goal, result, budget pacing and a call to action.
- **Custom campaigns:** events, catering and one-offs, each with its own goal and budget, same tracking.
- **Offers:** what the restaurant gives us to work with; every redemption traced. **Effort timeline** of what was done, and **paid media** by platform.

### Management

- **Approval queue:** a click sends an approved piece straight to the calendar.
- **Posting calendar** and **content library** with every piece in one place, plus tasks and messages with the Atrium team.

### Benchmarks (V3)

You against the 10-mile radius as bars, the moat metrics, category rankings and forecasting. Examples of the framing: the average Houston restaurant pays $52 for a catering lead; you are at $19.

### Reporting

The **report builder** (monthly), the **AI narrative** (generated from the month's data, edited by the strategist before sending) and the **archive**.

### Settings

Organization, **data sources** (N8N → Supabase, with the status of each), and the **team** with each member's access.

## Estimates are labeled

On-premise sales are an estimate: matched orders × the average ticket, with the ticket size set in settings. Online orders and reservations use actual checks. A label says which is which.
