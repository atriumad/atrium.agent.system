---
sidebar_position: 3
title: "Metrics and scoring"
description: "Funnel stages, vocabulary, the metric inventory per engine, engine scores, benchmarks and practice grading."
---

# Metrics and *scoring*

A signal is the individual counted event; a metric is signals calculated over a period (sum, avg, rate or latest) and it can render as a total, a trend, a share or a comparison against a benchmark. "Impressions" the signal becomes "Impressions · 30 days" the metric. The inventory below is the build list: every number any screen shows must resolve to one of these rows.

## Funnel stages

Every metric maps to exactly one funnel stage, stored as `funnel_stage`: `awareness`, `consideration`, `buying_intent`, `outcome` or `none`. Data is structured stage first, platform second. Outcomes (orders, reservations, leads) are their own bucket downstream of buying intent; `none` is for health numbers that live outside the funnel (rating, spend, rank).

| Stage | Question | Primary metric | Also |
| --- | --- | --- | --- |
| **Awareness** | Did the city see you? | Impressions | Reach, Video views, Followers, Discovery searches |
| **Consideration** | Did they lean in? | Engagements | Engagement rate, Profile visits, Sessions, Link clicks, Saves, Menu views |
| **Buying intent** | Are they ready to act? | Intent actions (sum) | Directions, Calls, Order clicks, Reserve clicks, RSVPs, QR scans. Converts into outcomes: orders, reservations, leads, RSVPs, redemptions |

## One name per metric

Canonical label on the left; never ship the synonyms.

| Use | Not |
| --- | --- |
| Impressions | views served |
| Reach | accounts or people reached |
| Video views | story or reel views |
| Engagements | interactions |
| Engagement rate | ER, interaction rate |
| Profile visits | profile views |
| Sessions | website sessions, visits |
| Link clicks | website clicks, bio taps |
| GBP actions | Google actions |
| Directions | direction requests, direction taps |
| Calls | phone calls, call taps |
| Orders | orders (est.) |

## The metric row

| Field | Type | Example | Notes |
| --- | --- | --- | --- |
| `id` | string | `impressions_total` | snake_case, stable, unique |
| `label` | string | Impressions | Canonical name from the vocabulary, Title Case |
| `unit` | enum | `count` | `count` \| `%` \| `$` \| `rating` \| `rank` \| `ratio` \| `hours` |
| `formula` | string | `sum(impression)` | `sum` \| `avg` \| `rate(a÷b)` \| `latest`, over signal rows in range |
| `funnel_stage` | enum | `awareness` | `awareness` \| `consideration` \| `buying_intent` \| `outcome` \| `none` |
| `engine` | enum | `acquisition` | Which of the 5 it rolls into |
| `cadence` | enum | `daily` | How often the rollup refreshes: `realtime` \| `hourly` \| `daily` \| `monthly` |
| `benchmark` | number? | 152000 | 10-mile radius average, monthly, nullable |
| `prior` | number? | 312000 | Same-length prior window, for deltas |
| `element_scope` | bool | true | Whether the metric also exists per element (reel views) or only overall (followers) |

## Metric inventory by engine

### Discoverability

| Metric | Unit | Stage | Formula | Fed by |
| --- | --- | --- | --- | --- |
| Discovery searches | count | awareness | `sum(discovery_search)` | GBP |
| Direct searches | count | consideration | `sum(direct_search)` | GBP |
| Profile visits · GBP | count | consideration | `sum(profile_visit, source=gbp)` | GBP |
| GBP actions | count | consideration | `sum(direction + call + link_click, source=gbp)` | GBP |
| Directions | count | buying intent | `sum(direction)` | GBP + hub |
| Calls | count | buying intent | `sum(call)` | GBP + hub |
| Maps rank | rank | none | `latest(rank_point)` | Rank tracker |
| Listings synced | count | none | `count(listings, status=synced)` | Listings audit |

### Acquisition

| Metric | Unit | Stage | Formula | Fed by |
| --- | --- | --- | --- | --- |
| Impressions | count | awareness | `sum(impression)` | Metricool + ads |
| Reach | count | awareness | `sum(reach_account)` | Metricool |
| Video views | count | awareness | `sum(video_view)` | Metricool |
| Followers | count | awareness | `latest(follower_add, cumulative)` | Metricool |
| Engagements | count | consideration | `sum(engagement + save)` | Metricool |
| Engagement rate | % | consideration | `engagements ÷ reach` | Built |
| Profile visits | count | consideration | `sum(profile_visit)` | Metricool |
| Sessions | count | consideration | `sum(session, source=landing\|site)` | Hub + pixel |
| Link clicks | count | consideration | `sum(link_click)` | Metricool + hub |
| Intent actions | count | buying intent | `sum(direction + call + order_click + reserve_click)` | Hub + GBP |
| Content published | count | none | `count(elements, type=social, published in range)` | Elements registry |
| Top-content views | count | awareness | `sum(video_view + impression, top elements)` | Element rollup |

### Reputation

| Metric | Unit | Stage | Formula | Fed by |
| --- | --- | --- | --- | --- |
| Google rating | rating | none | `latest(rating_point)` | GBP |
| New reviews | count | none | `sum(review)` | GBP + platforms |
| Response rate | % | none | `review_reply ÷ review` | GBP |
| Reply time | hours | none | `avg(reply_delay)` | GBP |
| 5-star share | % | none | `5★ reviews ÷ reviews` | GBP + platforms |
| Review-request conversion | % | none | `review ÷ request sent` | Survey Flow |
| Survey score | rating | none | `avg(survey_score)` | Survey Flow |

### Retention

| Metric | Unit | Stage | Formula | Fed by |
| --- | --- | --- | --- | --- |
| Repeat guest rate | % | outcome | `repeat_visit guests ÷ guests` | Toast |
| Loyalty members | count | none | `latest(loyalty_signup, cumulative)` | Toast |
| Open rate | % | consideration | `email_open ÷ sent` | Not tracked yet; later, with marketing and CRM |
| Click rate | % | consideration | `email_click ÷ sent` | Not tracked yet; later, with marketing and CRM |
| Redemptions | count | outcome | `sum(redemption)` | Toast + Resend |
| Win-back returns | count | outcome | `sum(winback_visit)` | Toast match |
| Email revenue | $ | outcome | `sum(revenue, window 14d)` | Toast match |
| Opt-outs | count | none | `sum(opt_out)` | Resend |

### Growth

| Metric | Unit | Stage | Formula | Fed by |
| --- | --- | --- | --- | --- |
| Spend | $ | none | `sum(spend)` | Ads APIs |
| Paid impressions | count | awareness | `sum(impression, source=ads)` | Ads APIs |
| Clicks | count | consideration | `sum(link_click, source=ads)` | Ads APIs |
| Orders from ads | count | outcome | `sum(order, attributed)` | Pixel + Toast |
| Reservations from ads | count | outcome | `sum(reservation, attributed)` | Pixel |
| Matched on-premise orders | count | outcome | pixel, loyalty or card match vs POS | Estimate · built |
| On-premise sales (est.) | $ | outcome | `matched orders × average ticket` | Estimate · built |
| ROAS · per bucket | ratio | none | `sales ÷ spend` | Built |
| Cost per action | $ | none | `spend ÷ outcomes` | Built |
| Leads | count | outcome | `sum(lead)` | Meta forms |

## Engine scores

`score = 0.6 × measured + 0.4 × practice`. **Measured** (quantitative): each engine metric normalized against the 10-mile benchmark, `min(you ÷ bench, 2) ÷ 2 × 100`, averaged across the engine's metrics. **Practice** (qualitative): criteria no API reports, graded 0–4 by Atrium agents on a fixed rubric, refreshed weekly, normalized to 0–100. Weights are editable per engine.

| Engine | Measured headline | Practice rubric |
| --- | --- | --- |
| Discoverability | GBP actions, discovery searches, Maps rank. Setup readiness across GBP, listings, SEO, profiles, links and pixels: the plumbing that makes you findable before a single dollar of reach | Profile completeness, NAP consistency, schema present, bio-link health |
| Acquisition | Impressions, engagement rate, profile visits, intent actions. Awareness → consideration → buying intent | Posting consistency, feed cohesion, hook quality, geo-tag discipline |
| Reputation | Rating, velocity, response rate, 5-star share, survey scores | Reply speed, reply quality, review-ask cadence, sentiment handling |
| Retention | Open rate, redemption, repeat rate, win-back, tied to opt-in source | List hygiene, automation coverage, offer cadence, segmentation depth |
| Growth | Spend, ROAS by bucket, cost per action. Three always-on buckets (on-premise estimated, online orders, reservations) plus custom campaigns | Pixel health, creative refresh rate, budget pacing, landing-page match |

The composite, the **Growth Score**, is the five engine scores weighted equally (60 points each), 0–300, compared with the same blend for the 10-mile radius.

## Benchmarks and comparisons

Every number is judged three ways.

| Comparison | What it is | Stored as |
| --- | --- | --- |
| **vs prior period** | Same-length window immediately before the selected range. Powers every delta and the momentum sparklines | `prior`, per range, self |
| **vs 10-mile radius** | Monthly benchmark per metric, aggregated from restaurants within 10 miles. Powers the amber ticks, opportunity chips and the measured half of every score | `benchmark`, monthly |
| **range math** | 7D, 30D, 90D and custom are the same operation: filter `signals_daily` by date, then aggregate | sum or avg over daily stamps |
| **per location** | Every signal carries the location; multi-location accounts filter first, then aggregate | `location_id` on every row |

## Who grades practice

Every practice criterion is graded by an agent on a 0–4 scale and written to `agent_grades` weekly, with `source` equal to the agent's id: the same contract as every other signal. See [Agents](../agents).

| Engine | Agent | Grades |
| --- | --- | --- |
| Discoverability | Concierge | Radar: nightly GBP and listings scan, flags NAP drift, dead links, wrong hours; profile completeness. Schema: site schema, menu links and pixels after every deploy |
| Acquisition | Herald | Pulse: posting cadence against plan, feed cohesion (vision pass over the grid), hook analysis (first-3-second retention) |
| Reputation | Host | Echo: reply speed and quality. Sentiment: clusters review and survey themes. Ask: review-request timing |
| Retention | Sommelier | Memory: list hygiene and segmentation depth. Flows: automation coverage and send-time quality |
| Growth | Steward | Pacer: budget pacing. Refresher: creative fatigue and refresh rate. Ledger: attribution coverage |
