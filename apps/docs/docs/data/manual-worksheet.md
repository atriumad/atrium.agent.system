---
sidebar_position: 5
title: "Monthly signals worksheet"
description: "The manual entry process, one sheet per client per month, that maps one-to-one to the data columns."
---

# Monthly signals *worksheet*

Until a connector exists for every source, the Assistant Account Manager fills one sheet per client, once per month. Pull each number from the platform's own insights panel for the last full calendar month, write it in, then compute the metrics and the revenue math. The names and buckets are the same as in the [data model](../data): when this goes digital, the columns map one-to-one.

**Header:** client, month, prepared by, date completed, average ticket size ($) and the source of that ticket size (POS or owner). If a platform does not report a signal, write `n/a`; never leave a cell blank.

## A · Raw signals by source

Copy the number exactly as the platform reports it. Δ is this month minus the prior month; write a minus sign when it fell.

| Source | Signals to collect (where to find them) |
| --- | --- |
| Instagram | Impressions (Insights → Views), Reach (Accounts reached), Engagements (likes + comments + saves + shares), Profile visits (Profile activity), Link clicks (external link taps), Followers at end of month |
| TikTok | Video views, Reach (Reached audience), Engagements (likes + comments + shares + saves), Profile visits (Profile views), Followers at end of month |
| Facebook | Reach (Meta Business Suite → Insights), Engagements (reactions + comments + shares), Page visits, Followers at end of month |
| Google Business Profile | Profile views from Search, Profile views from Maps, Calls, Directions, Website clicks (all under Performance) |
| Website | Sessions (GA4 or the site builder), Reservation clicks (Reserve, OpenTable, Resy), Order clicks (Order Online) |
| Email / SMS | Sends, Opens, Link clicks (CRM campaign report, all flights), Redemptions (POS discount report or offer-code count) |
| Reviews | New Google reviews, Google rating (overall), New Yelp reviews, Reviews replied to |
| POS | Orders or covers, Gross sales ($), Average ticket = gross ÷ orders (carry to the header and to section C) |

## B · Calculated metrics, by funnel stage

Round rates to one decimal. These feed the engine scores.

| Stage | Metric | Formula |
| --- | --- | --- |
| Awareness | Total reach | IG reach + TikTok reach + FB reach |
| Awareness | Total impressions | IG impressions + TikTok video views |
| Awareness | Local visibility | GBP Search views + Maps views |
| Consideration | Engagement rate (%) | (IG + TikTok + FB engagements) ÷ total reach × 100 |
| Consideration | Total profile visits | IG + TikTok profile visits + FB page visits |
| Consideration | Follower growth | Sum of follower Δ across IG, TikTok and FB |
| Consideration | Email open rate (%) | Opens ÷ sends × 100 |
| Buying intent | Intent actions | Calls + directions + GBP website clicks + reservation clicks + order clicks |
| Buying intent | Social → site rate (%) | (IG link clicks + email link clicks) ÷ sessions × 100 |
| Buying intent | Intent rate (%) | Intent actions ÷ local visibility × 100 |
| Reputation | Review velocity | New Google + Yelp reviews this month |
| Reputation | Reply rate (%) | Replies posted ÷ new reviews × 100 |
| Reputation | Rating Δ | Google rating this month − prior month |

## C · Ticket-size math: what the month was worth

These are **influenced estimates, not attribution**. The show-rate assumption is 0.30 of intent actions becoming a visit; keep it unless the Account Manager sets a different one for the client.

| Estimate | Math |
| --- | --- |
| Estimated visits from intent | Intent actions × 0.30 |
| Revenue influenced, intent | Estimated visits × average ticket |
| Revenue, email and SMS offers | Redemptions × average ticket |
| Total influenced revenue | Intent revenue + email and SMS revenue |
| vs. retainer | Total influenced revenue ÷ monthly retainer |

Notes and flags for the Account Manager go at the bottom. The sheet is signed by the Assistant Account Manager who completed it and the Account Manager who reviewed it.
