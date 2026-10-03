---
sidebar_position: 7
title: "Add a metric"
description: "Put a new number on a screen the right way."
---

# Add a *metric*

Every number any screen shows must resolve to a row of the [metric inventory](../data/metrics-and-scoring). Nothing is computed in a component.

1. **Check the vocabulary.** If the metric already exists under another name, use the canonical one. Never ship a synonym.
2. **Define the row:** `id`, canonical `label`, `unit`, `formula` over signal types, `funnel_stage`, `engine`, `cadence`, and whether it exists per element.
3. **Add the signal types** it needs to the enum, if any, before shipping them.
4. **Decide the benchmark.** If there is a 10-mile benchmark, say how it is sourced; if not, the metric renders without the amber tick and stays out of the measured half of the score.
5. **Decide its score role.** Which engine's measured half does it join, and with what weight; or is it display only?
6. **Add the golden case** for the formula in `@atrium/scoring` or the metric tests, with real numbers.
7. **Label estimates.** If any part is an estimate, store its method.
8. **Update the docs** in both languages, and the worksheet if the number can be collected by hand.
