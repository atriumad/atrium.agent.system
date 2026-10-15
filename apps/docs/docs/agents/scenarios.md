---
sidebar_position: 10
title: "Scenarios"
description: "Three real situations, step by step."
---

# Three situations, *step by step*

The examples use Casa Olivo, a fictional restaurant. Steps marked **(person)** are human decisions.

## A 2★ review arrives

```mermaid
sequenceDiagram
  participant G as Google
  participant E as Echo
  participant R as Recovery
  participant AM as Account Manager
  participant M as Maître
  G->>E: New 2★ review (long wait)
  E->>E: Classifies it and drafts a brand-voice reply
  E->>AM: Draft in the approval queue; negatives need written sign-off
  AM-->>E: Approves with one change (person)
  E->>G: Publishes the reply
  R->>AM: Opens a private case if the same guest answered a survey
  M->>AM: Weekly brief: 3 reviews about waiting
```

**Result:** public reply within 24–48 h, a private case when the guest is known, and the response rate at 98–100%. A public review is never linked to a guest by guessing: the case opens only from a survey response or when the Account Manager links it.

## A slow Tuesday

1. **Scorekeeper** detects that Tuesdays are below the 8-week average.
2. **Campaigner** proposes a Tuesday offer with its own promo code so it can be measured.
3. The owner approves it from the Platform or the Mobile app **(person)**.
4. **Crave** drafts the post and the story; they wait in the approval queue.
5. **Letters** prepares the email only for guests who have consented.
6. **Pacer** sets the always-on spend for the day inside the guardrail.
7. **Ledger** attributes the visits that used the code, labeled as code attribution.

## A new guest becomes a regular

1. **Capture**: the guest scans the table QR, leaves their email and accepts communications.
2. **Memory** creates their profile and joins it to the visit.
3. **Flows** sends the 24 h welcome with a short survey.
4. **Ask** includes the review request for everyone, regardless of the answer.
5. Day 60 without returning: **Flows** sends the win-back with a menu novelty.
6. 5th visit: **Crown** recognizes them as a regular.
7. **Amplify** uses the regulars' audience to find lookalikes.
