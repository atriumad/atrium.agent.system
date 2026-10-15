---
sidebar_position: 5
title: "Integrations"
description: "Providers, how each connects, its cadence and its status."
---

# *Integrations*

The system exists to read these providers. Each connects through an N8N workflow that calls the ingestion API (see [Storage and pipeline](../data/storage-and-pipeline)), and every connector has a manual fallback.

## Providers

| Provider | Brings | Connects via | Cadence | Fallback |
| --- | --- | --- | --- | --- |
| Toast POS | Orders, revenue, guests, average ticket, repeat visits, loyalty members, redemptions. The outcome system of record | Nightly export over SFTP, or the partner API when the program is approved | every 4 h (API) or nightly (export) | Daily entry and CSV import |
| Metricool | IG, FB, TikTok and YouTube metrics with per-post rows | Metricool API | every 6 h | Monthly signals worksheet |
| Google Business Profile | Profile actions, searches, reviews, Maps rank | GBP API (basic access requested in week 0) | daily | Manual log of calls, directions and reviews |
| Resend | Email sends, deliveries, bounces, complaints, opt-outs, attributed revenue | Resend API and webhooks | 4 h + webhooks | Campaign report copied by hand |
| Meta Ads | Spend, impressions, reach, clicks, conversions, CPM, CPC | Marketing API | daily | Daily entry |
| Google Ads | Spend, impressions, clicks, conversions, cost per action | Google Ads API | daily | Daily entry |
| Atrium Landing (hub) | Hub sessions and every button tap | First-party, direct to the API | realtime | — |
| Survey Flow | Post-order scores, QR opt-ins | First-party, direct to the API | realtime | — |
| Review platforms | Reviews, rating points, replies and reply delay | GBP API, Yelp, scrape where there is no API | daily | Manual log |
| Rank tracker | Maps rank for the client's keywords | Rank tracker API | daily | Manual keyword rank entry |
| Brand survey (quarterly) | Unprompted awareness by zone | Survey panel, imported | quarterly | — |

## Rules

- **Normalized.** Every connector writes `signals_daily` rows in the same shape. Adding a source is writing a workflow, never touching the agents.
- **Idempotent.** A re-run replaces the day; nothing double counts.
- **Observable.** Each connector reports its last successful sync; the Platform shows it ("synced via N8N: Toast 22 m, Metricool 1 h…") and the Manager marks a source as syncing or needing attention.
- **Least privilege.** Connectors hold only the credentials of the clients they serve, kept in the platform's secret manager.
- **Fallback.** When a connector fails, the Account Manager logs the numbers by hand through the daily entry, with `source = manual`.

## Third-party constraints

| Provider | Constraint | What to do |
| --- | --- | --- |
| Toast | Standard API access is read-only and does not return diner data on dine-in orders; the full route needs the partner program, which takes months | Start with the nightly export; apply to the partner program in parallel |
| Reservation platforms (OpenTable, Resy, SevenRooms, Tock) | No public write API | Measure through reserve clicks and UTM links |
| Google Business Profile | API access requires an application | Request basic access in week 0 |

## Sources consulted

- [Toast · Standard API access FAQs](https://doc.toasttab.com/doc/devguide/devApiAccessFAQs.html)
- [Toast · Data exports overview](https://support.toasttab.com/en/article/Automated-Nightly-Data-Export-1492723819691)
- [Google Business Profile APIs · Prerequisites](https://developers.google.com/my-business/content/prereqs)
