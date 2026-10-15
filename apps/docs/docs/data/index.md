---
sidebar_position: 1
title: "Data model"
description: "Signal → metric → score: how every number in Atrium is produced."
---

# Data architecture: *signal → metric → score*

Everything the platform shows is math over one atomic thing: a **daily-stamped signal**. Signals come from sources, and from individual elements inside them. Metrics are built from signals, grouped by engine and tagged by funnel stage. Each engine blends measured and practice into a score, and the five scores make the Growth Score.

## The stack: five layers

Each layer is built only from the one below.

| # | Layer | Question | What it is |
| --- | --- | --- | --- |
| 1 | **Sources and elements** | Where does it originate? | Platforms and feeds: socials, GBP, the landing hub, POS, email, ads. Some carry individual elements (a reel, an email, an ad, an offer) that signals attribute to |
| 2 | **Signals** | What is the individual event, daily-stamped? | The atom: every impression, tap, order, review and grade lands as one row in `signals_daily` |
| 3 | **Metrics** | Signals, calculated over a period | A metric is signals aggregated over a date range (sum, avg, rate, latest), shown as a total, a trend, a share or a comparison. "Impressions over 30 days" is a metric; the impression is the signal |
| 4 | **Engine scores** | Quantitative and qualitative | Five engines, each 0–100: 60% measured against the benchmark and 40% practice graded by agents |
| 5 | **Growth Score** | One number | The five engine scores blended, 0–300, compared with the same blend for the 10-mile radius |

## What the layers buy us

| Operation | Gives |
| --- | --- |
| `sum` | Totals over any range |
| `trend` | Daily series, sparklines and momentum |
| `rate` | a ÷ b: engagement rate, ROAS, conversion |
| `latest` | Point-in-time values: followers, rating, rank |
| `compare` | Against the prior period and against the 10-mile radius |
| `score` | Normalize into 0–100 per engine |

7D, 30D, 90D and custom ranges are all the same operation: filter `signals_daily` by date, then aggregate. There are no pre-baked ranges anywhere. Every signal carries its location, so multi-location accounts filter first and aggregate after.

## In this section

- [Signals and sources](./signals-and-sources): the signal row, the enum, the sources, the hub, elements.
- [Metrics and scoring](./metrics-and-scoring): funnel stages, vocabulary, the metric inventory per engine, scores, benchmarks, practice grading.
- [Storage and pipeline](./storage-and-pipeline): the six tables, connectors, identity stitching, attribution methods.
- [Monthly signals worksheet](./manual-worksheet): the manual process that maps one-to-one to the columns.
