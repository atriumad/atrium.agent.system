---
id: 0012-own-reservations-by-covers
sidebar_position: 13
title: "0012 · Own reservations by cover pacing"
sidebar_label: "0012 · Own reservations by cover pacing"
description: "Own reservations by cover pacing"
---

# ADR 0012: Own reservations by cover pacing

| Status | Date | Deciders |
| --- | --- | --- |
| **Deferred** | 2026-10-01 | Atrium · product and technology |

:::note
Deferred. Not part of the current plan. See [Booker](../modules/booker).
:::

## Context

OpenTable, Resy, SevenRooms and Tock do not offer a public write API. Most target restaurants need online reservations without managing tables. The first release can measure reservations through reserve clicks and the POS.

## Decision

When built, Booker is an own module that controls covers per 15-minute interval with duration per party size and configurable online capacity. Table map, waitlist and deposits come later still.

## Consequences

- Faster path to a first release without it.
- The table map can be added on top of the same model.
- Reservation outcomes come from reserve clicks and the POS until then.

## Discarded alternatives

- Integrating existing platforms: only through partner programs.
- Table map from the start: doubles the scope.
