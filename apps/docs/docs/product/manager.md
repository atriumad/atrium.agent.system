---
sidebar_position: 3
title: "Manager"
description: "The agency's web app: portfolio, client workspaces, delivery projects, tasks, content pipeline, COG, approvals and data status."
---

# Manager: the *Agency OS*

The Manager is where Atrium runs its delivery. The same view can be seen **as** any role, with that role's tasks.

## Sections

| Section | What it holds |
| --- | --- |
| **Portfolio** | Portfolio health (average Growth Score, active, at risk), the client roster, "needs your attention" and "launching this week" |
| **Client workspace** | One client: score and package, what we're doing this cycle, content in motion, MRR and renewal, data sources, package access, then a jump to their Platform |
| **Projects** | One cycle per client plus custom campaigns: assets done, reels and graphics progress, cycle stage, on pace or behind |
| **Tasks** | The tasks database: stage nature, task type, status, responsible, standard and actual hours, due status |
| **Content** | The content board across the pipeline, a ticket per piece with comments |
| **Studio** | The posting calendar, ready to post, batch timelines for graphics and reels, daily pending, email |
| **Approvals** | Everything awaiting the client's OK, with how long it has waited |
| **Client COG** | The Client Operational Guidelines |
| **Packages** | The access matrix: who sees what |
| **Data** | Integration status per client and source |
| **Daily entry** | The manual log of what shipped, timestamped |
| **Team** | People, clients, MRR managed, open tasks, capacity |

The Overview answers "what in my portfolio needs a person now?" with a queue first and the figures after; every definition is in [Reading the Overview](../guides/reading-the-overview). Cases and Responses are tables with a summary band on top; see [Tables and section pages](../guides/tables-and-section-pages).

## Roles

| Role | Code | Owns |
| --- | --- | --- |
| Account Manager | `am` | The client relationship; fires the tasks from the COG; approvals; KPI reporting; client strategy call; ads setup; weekly pacing; monthly report |
| Assistant Account Manager | `aam` | Calendar build and review; distribution and publishing; story distribution; engagement and reviews; GBP and community |
| Creative Director | `cd` | The internal strategy doc (MAP); pre-production; content shoot; post-production planning; QC in Milanote; shoot direction |
| Assistant Creative Director | `acd` | QC of produced content |
| Developer | `dev` | CRM and email build; automation QC; reputation, SEO and discoverability; pixel and tracking; landing pages |
| Graphic Designer | `gd` | Graphics and carousels |
| Video Editor | `ve` | Reel editing |

Only the Account Manager fires tasks. Everyone else sees the tasks assigned to them and can add content.

## Client health

Each client is **on track**, **needs attention** or **at risk**, from the Growth Score and its delta, review trend, approvals waiting more than 6 days and onboarding gaps (for example GBP or Toast not yet connected).

## The delivery cycle

A monthly cycle anchored to the billing date, in three stages: **Strategy → Production → Distribution**. Reporting, CRM, ads and SEO, and management run alongside as their own stage natures.

| Step | Task | Window | Owners |
| --- | --- | --- | --- |
| 0 | COG review and all tasks fired | Day 0 | AM |
| 1 | KPI reporting and rollover | Day 0–1 | AM, DEV |
| 2 | Client strategy call | Day 1–2 | AM, CD |
| 3 | Internal strategy doc (MAP) | Day 2–3 | CD |
| 4 | Pre-production and Milanote briefs | Day 3–6 | CD |
| 5 | Content shoot (Tue, Wed or Thu) | Day 7 | CD, AM |
| 6 | Post-production planning and Milanote QC | Day 8–9 | AM, CD |
| 7 | Calendar build and lock | Day 10–12 | AAM, AM |
| 8 | Editing and design: all assets due | Day 9–14 | CD |
| 9 | Ads setup and launch | Day 10–12 | AM |
| 10 | CRM and email build | Day 10–14 | AM, DEV |
| 11 | Distribution starts | Day 13–21 | AAM |
| 12 | Engagement, reviews, GBP and stories | Day 13–27 | AAM |
| · | Weekly pacing check | Every Friday | AM |
| · | Monthly report and strategy call | Day 1 of next cycle | AM, CD |

## Content pipeline

Content is fulfillment: reels, statics and emails flow through eight statuses, and each status has an owner.

| # | Status | Owner |
| --- | --- | --- |
| 1 | Ready to Shoot | Creative Director |
| 2 | Copywriter | Copy · AAM |
| 3 | Produced | Content team |
| 4 | Editing | Video Editor or Designer |
| 5 | QC | Assistant Creative Director |
| 6 | Revision | Creative Director or AM |
| 7 | Ready to Post | Assistant Account Manager |
| 8 | Posted or Scheduled | Live |

A piece carries a format (reel, graphic, carousel, email, YouTube), an origin (cycle, extra or request), a label that sets its time ceiling, a post date, an internal checklist and a comment thread.

### Label ceilings

Hard limits on production time per label. Over the ceiling: escalate to the Creative Director before starting.

| Label | Ceiling |
| --- | --- |
| LER, low-effort reel | 50 min |
| MER, medium-effort reel | 1 h 40 |
| HER, high-effort reel | 2 h 30 |
| HEH, high-effort hero (YouTube) | 3 h 20 |
| LEG, low-effort graphic | 30 min |
| MEG, medium-effort graphic | 50 min |
| HEG, high-effort graphic | 1 h 20 |

## Tasks

A task has a stage nature (Strategy and pre-production, Production and post, Distribution, Reporting, CRM · automations · ads · SEO, Management), a task type, a status (To Do, In Progress, Ready to Revise, Done), one or more responsible people, standard and actual hours (the bar shows time efficiency) and a due status (overdue, due soon, on track). Views: My tasks, By project, By stage, All.

## Client COG

The Client Operational Guidelines turn the promise into measurable units. Every unit in the scope becomes a metric on the client's board and is measured against this plan; the cycle calendar fires the tasks.

| Part | Content |
| --- | --- |
| **Account team** | Who is assigned to the client in each role, with the option to swap a person |
| **Scope and deliverables** | Core content (reels, graphics, story sets, shoot days), growth content (narrative reels, chef and founder POV, ambassador collabs), social and reputation (community management, review replies, GBP updates), email (campaigns, automations), ads (Meta always-on, Google Search, performance campaigns) |
| **Cycle calendar** | The steps above, with each client's own owners |
| **Work volume** | Standard hours by role, from the fired tasks, plus the label ceilings |
| **Standing guardrails** | Approval required before any paid launch, price or menu claim, or competitor mention; never post competitor names unless approved or unverified health claims; tone and voice; negative-review protocol (flag to AM, written sign-off, reply within 24–48 h); calendar changes only after a trade-off conversation |
| **Standing weekly** | Weekly GBP "What's New" post aligned with the current offer; review monitoring twice a week; community management with nothing unanswered over 24 h; always-on Meta ad confirmed running; stories published daily; every task has an owner and a due date |
| **Tech stack status** | Toast POS, Metricool, Resend, Google Business Profile, Meta Business Manager, Meta Pixel, GA4, N8N, SemRush: connected or pending |
| **Key dates** | Events and ambassador visits; weekly pacing; the monthly report |
| **Change log** | "If it is not here, it is not official": every change to scope, with who and why |

The standing guardrails and weekly rules are the human version of the [common rules](../agents/common-rules): the agents enforce them in code.

## Daily entry

A manual log, one section per module the client's package unlocks, in which each deliverable type brings its own metric fields. Every line is timestamped and appends to the master daily log: this is the raw feed the calculations read until a connector exists. It writes into `signals_daily` with `source = manual`.

| Section | Package minimum | Types and fields |
| --- | --- | --- |
| Content and social | Basic | Reel (views, reach, saves, shares, comments), feed post, story, carousel |
| Ads · Meta and Google | Full | Meta campaign (spend, impressions, reach, clicks, leads), Google Search, boosted post |
| Local and SEO · GBP | Basic | GBP post, GBP photos, keyword rank |
| Reputation and reviews | Full | Review requests, reviews received, review responses |
| Email · Resend | Full | Email campaign (sent, revenue; opens and clicks later, with marketing and CRM) |
| Leads and campaigns | Basic | Catering lead, reservation, event RSVP |

## Data status

A matrix of clients against sources (Toast, Meta, Metricool, Resend, GBP, Survey): **connected**, **syncing**, **needs attention** or **not connected**. It is the onboarding checklist and the first place to look when a number goes stale.
