---
id: 0018-no-review-gating
sidebar_position: 19
title: "0018 · Review requests are never filtered by rating"
sidebar_label: "0018 · Review requests are never filtered by rating"
description: "Review requests are never filtered by rating"
---

# ADR 0018: Review requests are never filtered by rating

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

The source flow routed guests with a good experience to Google and unhappy guests to a private recovery channel. Google's policy prohibits asking only satisfied guests for reviews, and it can remove reviews or penalize the profile.

## Decision

Everyone is asked for a review. The survey shows the Google review button to every guest regardless of rating, and offers a private channel in addition, never instead. The review link is added by the system in the template; no tool lets it depend on the response. Loyalty and offers are never conditioned on a review.

## Consequences

- Compliance with Google's policy.
- Rating reflects every guest, which is also what the benchmark measures.
- The private channel still catches problems early, because it is shown to everyone.

## Discarded alternatives

- Sentiment routing: simpler to explain, and prohibited.
- Asking only after a good survey score: the same practice by another name.
