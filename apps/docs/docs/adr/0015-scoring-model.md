---
id: 0015-scoring-model
sidebar_position: 16
title: "0015 · Engine scores: 60% measured, 40% practice"
sidebar_label: "0015 · Engine scores: 60% measured, 40% practice"
description: "Engine scores: 60% measured, 40% practice"
---

# ADR 0015: Engine scores: 60% measured, 40% practice

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

A single number must be fair to a restaurant of any size and honest about what no API can report. Raw volume favors big venues; measured-only scores ignore practice quality.

## Decision

Each engine scores 0–100: 60% measured, each metric normalized against the 10-mile radius benchmark as `min(you ÷ bench, 2) ÷ 2 × 100`, plus 40% practice, criteria graded 0–4 by agents on a fixed rubric and refreshed weekly. The Growth Score is the five engine scores weighted equally, 0–300, shown beside the same blend for the radius. Weights are editable per engine and are calibrated with the first 5 clients.

## Consequences

- Scores compare a restaurant with its own neighborhood, not with a national average.
- Practice criteria make the score reflect the work as well as the result.
- Agents have a precise job: grade a rubric with evidence.
- Needs a benchmark source and a minimum sample size ([open decision](../plan/open-decisions)).

## Discarded alternatives

- Measured only: blind to execution quality.
- Absolute targets: unfair across venue sizes.
- A 0–100 composite: loses the per-engine view the team and the client use.
