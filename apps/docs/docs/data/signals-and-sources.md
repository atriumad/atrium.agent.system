---
sidebar_position: 2
title: "Signals and sources"
description: "The signal row, the signal-type enum, sources and cadence, the landing hub and individual elements."
---

# Signals and *sources*

A signal is the individual counted thing: the impression, the tap, the order (what platforms casually call a metric). Minimum granularity is the day. Realtime sources (hub, surveys, webhooks) still land as daily stamps; nothing downstream needs finer resolution. Sums, trends, rates and comparisons are all range math over daily rows.

## The signal row

| Field | Type | Example | Notes |
| --- | --- | --- | --- |
| `date` | date | 2026-07-10 | The daily stamp. Minimum granularity; realtime feeds roll up nightly into the day row |
| `location_id` | uuid | — | Every signal belongs to a location of a client |
| `source` | enum | `metricool` | `metricool` \| `gbp` \| `landing` \| `site` \| `toast` \| `meta_ads` \| `google_ads` \| `survey` \| `review` \| `manual` \| `agent` |
| `platform` | enum? | `instagram` | `instagram` \| `facebook` \| `tiktok` \| `youtube` \| `google` \| `meta`. Null when the source has no platform split |
| `element_id` | string? | `reel_0712_pastor` | Present when the signal belongs to an individual element |
| `signal_type` | enum | `video_view` | Canonical snake_case from the enum below. One name per event, never synonyms |
| `value` | number | 4820 | A count or dollars. Formatting is view-side only |
| `meta` | json? | `{ "utm": "qr-tent", "zone": "bellaire", "button": "order" }` | Source tag, UTM, geo zone, button, campaign, match method (pixel, phone, card) |
| `guest_id` | string? | `g_88412` | Stitched identity so one guest counts once across sources |

## `signal_type`: the full enum

Canonical, snake_case, grouped by funnel stage. Add types here before shipping them.

| Stage | Signal types |
| --- | --- |
| **Awareness** | `impression`, `reach_account`, `video_view`, `follower_add`, `discovery_search` |
| **Consideration** | `engagement` (like, comment, share), `save`, `profile_visit`, `session`, `menu_view`, `link_click`, `email_open`, `email_click`, `direct_search` |
| **Buying intent** | `direction`, `call`, `order_click`, `reserve_click`, `rsvp`, `qr_scan` |
| **Outcome** | `order`, `reservation`, `redemption`, `lead`, `loyalty_signup`, `repeat_visit`, `winback_visit`, `revenue` |
| **Health and operations** | `review`, `review_reply`, `survey_score`, `rating_point`, `rank_point`, `opt_in`, `opt_out`, `spend`, `agent_grade` |

## Sources and cadence

Every source emits overall metrics for the source itself; some also contain individual elements whose signals attribute to that element and roll up into the source totals.

| Source | What it emits | Cadence | Element-level? |
| --- | --- | --- | --- |
| Metricool · socials | The social standard set for IG, FB, TikTok and YouTube: impressions, reach, video views, followers, engagements, profile visits, link clicks, plus per-post rows | every 6 h | Yes: posts, reels, stories |
| Google Business | Profile visits, discovery and direct searches, GBP actions, directions, calls, photo views, reviews, Maps rank | daily | No: overall only |
| Atrium Landing · hub | Hub sessions and every button tap (order, reserve, directions, call, menu, their site), tagged with source and button | realtime → daily | Yes: each button |
| Their website | Sessions, menu views, order and reserve clicks via pixel, tracked alongside the hub | realtime → daily | No: overall only |
| Toast POS | Orders, revenue, guests, average ticket, repeat visits, loyalty members, redemptions. The outcome system of record | every 4 h | No: outcomes attribute back |
| Resend · email | Sends, deliveries, bounces, complaints, opt-ins and outs, attributed revenue window (14 d) | 4 h + webhooks | Yes: each campaign or automation |
| Meta Ads | Spend, paid impressions and reach, clicks, conversions (orders, reservations, leads, RSVPs), CPM and CPC | daily | Yes: campaign and ad set |
| Google Ads | Spend, search and Maps ad impressions, clicks, conversions, cost per action | daily | Yes: campaign |
| Survey Flow | Post-order scores, QR opt-ins; feeds Reputation and the guest list | realtime → daily | Yes: each survey |
| Review platforms | New reviews, rating points, replies and reply delay across Google, Yelp and others | daily | No: reviews are signals |
| Manual log | Orders, catering leads and RSVPs the Account Manager logs by hand. Same table, `source = manual`, timestamped | daily log | Optional |

Two sources appear in the Platform but not yet in the source inventory, and are specified as planned: the **quarterly brand survey** (unprompted awareness by zone) and **competitor tracking** (share of voice, estimated from tracked local reach and engagement). They are listed in [Open decisions](../plan/open-decisions).

## The landing hub

One link everywhere: a linktree for the restaurant, and the website-side source of record. It lives in every bio, QR code, GBP profile and ad. Each button tap logs a signal with source and button in `meta`. The session is **consideration**; the tap is **buying intent**. Buttons are elements: each has its own taps, source split and conversion. The restaurant's own website is tracked alongside it by pixel; together they are the website-side source of record.

| Button | Stage |
| --- | --- |
| Order online, Reserve a table, Directions, Call | Buying intent |
| Menu, Their website | Consideration |

## Standard metric sets per platform

The same metric has the same name on every platform; socials share one standard set.

| Platform | Metrics | Feed | Sync |
| --- | --- | --- | --- |
| Instagram | Followers, Reach, Impressions, Video views, Engagement rate, Saves, Profile visits, Link clicks | Metricool | every 6 h |
| Facebook | Followers, Reach, Impressions, Engagement rate, Link clicks | Metricool | every 6 h |
| TikTok | Followers, Reach, Video views, Engagement rate, Shares | Metricool | every 6 h |
| YouTube | Subscribers, Views, Impressions, Watch time | Metricool | every 6 h |
| Google Business | Profile visits, Discovery searches, Direct searches, Directions, Calls, Link clicks, Photo views, Maps rank | GBP API | daily |
| Atrium Landing | Sessions, Order clicks, Reservation clicks, Directions, Calls, Menu views, Source split (UTM) | first-party | realtime |
| Meta / Google Ads | Spend, Impressions, Reach, Clicks, CPM, CPC, CTR, Conversions, ROAS | Ads API | daily |
| Review platforms | Rating, Review count, New per month, Response rate, 5-star share | GBP + scrape | daily |

## Individual elements

An element's signals carry its `element_id`, so performance attributes to that specific piece, and the same rows roll up into the source's overall metrics. The element type determines exactly which signal fields it spawns, identical wherever the element appears. Sources also keep overall metrics that belong to no element (followers, profile visits, rating).

| Element | Source | Fields |
| --- | --- | --- |
| Reel | Metricool | Views, Reach, Saves, Shares, Comments, Link clicks |
| Feed post | Metricool | Reach, Likes, Saves, Comments |
| Story | Metricool | Views, Taps forward, Replies, Exits |
| Carousel | Metricool | Reach, Saves, Link clicks |
| Email | Resend | Sent, Open rate, Click rate, Revenue (14 d) |
| Meta ad | Meta | Spend, Impressions, Reach, Clicks, CPM, Leads, ROAS |
| Google ad | Google | Spend, Impressions, Clicks, CPC, Conversions |
| Offer | Toast + hub | Redemptions, Estimated sales, Channels live, Status |
| Hub button | Landing | Taps, Source split, Conversion to outcome |

:::tip Creative first
Atrium is a creative agency before it is a dashboard: content is the element. Every post, reel and email carries its own signals, so creative impact is attributable: which piece earned the impressions, the profile visits, the orders. Element rollups power the Wins cards and top drivers in the Platform, and agents grade hook quality and feed cohesion into the Acquisition practice score.
:::
