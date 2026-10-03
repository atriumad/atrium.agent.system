---
sidebar_position: 5
title: "Open decisions"
description: "What has to be closed, including the points where the source material disagrees."
---

# Decisions *to close in week 0*

| # | Question | Recommendation | Status |
| --- | --- | --- | --- |
| 1 | How many people build? | One developer with Claude Code: about 30 weeks. With two: about 20 | Open |
| 2 | Which engines? | Five: Discoverability, Acquisition, Reputation, Retention, Growth. The Platform prototype labels Acquisition "Attention" and titles Reputation "part of Retention", and lists Reporting as an engine; this documentation treats those as UI labels | Decided, to confirm |
| 3 | How do packages map to tiers? | Essential, Pillar 2 and Pillar 3 are what a client buys; Discover, Retain and Growth are service groupings. The two sets do not align one to one (Pillar 2 includes Reputation, a Retain service) | Open |
| 4 | Is Retention locked on Pillar 2? | The Manager matrix locks it; the Platform prototype unlocks it. This documentation follows the Manager | Proposed |
| 5 | Review gating | The source flow routes happy guests to Google. Corrected: everyone gets the review link ([ADR 0018](../adr/0018-no-review-gating)) | Decided |
| 6 | Names of the two new agents | Concierge (Discoverability) and Steward (Growth) | Proposed |
| 7 | Where does the 10-mile benchmark come from? | The portfolio alone is too small for a radius average. Needs a data source, a method and a minimum sample size | Open |
| 8 | Who runs the quarterly brand survey, and how? | Needs a panel provider, a cost and a method per zone | Open |
| 9 | How is share of voice estimated? | From tracked local reach and engagement; needs a competitor list per client and a method | Open |
| 10 | Which attribution view ships? | One of three table options (heatmap, segmented bars, leaderboards), after a review with clients | Open |
| 11 | Toast route | Nightly export first; the partner program in parallel | Proposed |
| 12 | Where do the API, worker, agents and N8N run? | Railway; Fly.io as an alternative | Proposed |
| 13 | Mobile distribution | Expo, TestFlight and Play internal testing first | Proposed |
| 14 | Growth Score color thresholds | 80, 60 per engine, scaled to 240 and 180 | Proposed |
| 15 | Brand tokens | The brand system (deep teal, mint, cloud, amber, a lowercase wordmark) and the product theme used here (ink, lime, cream) need to be reconciled in `packages/ui` | Open |
| 16 | Own booking engine | Deferred ([ADR 0012](../adr/0012-own-reservations-by-covers)) | Proposed |
| 17 | Which restaurants are the pilot? | 2 clients with Toast and an active Google profile, chosen in F1 | Open |
| 18 | The prototypes | The HTML prototypes in `guides-rules` are design references, not code to port | Proposed |

## Paperwork that starts in week 0

- [ ] Request for basic access to the Google Business Profile API
- [ ] Twilio account and the 10DLC brand registration for each pilot client
- [ ] Toast export enabled for the pilot clients, and the partner program application
- [ ] Metricool API access; Meta and Google Ads API access and developer tokens
- [ ] Email sending domain with SPF, DKIM and DMARC
- [ ] Vercel, Railway, Supabase and N8N accounts for three environments
- [ ] Apple Developer and Google Play accounts for the Mobile beta
