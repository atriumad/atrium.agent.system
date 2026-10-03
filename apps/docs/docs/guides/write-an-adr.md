---
sidebar_position: 8
title: "Write an ADR"
description: "Template and criteria for recording decisions."
---

# Write an *ADR*

Write an ADR when a decision is hard to reverse, affects more than one module, or someone will ask "why did we do this?" six months from now.

## Template

```markdown title="docs/adr/NNNN-short-title.md"
---
id: NNNN-short-title
title: "NNNN · One-line title"
---

# ADR NNNN: One-line title

| Status | Date | Deciders |
| --- | --- | --- |
| Proposed | YYYY-MM-DD | names or roles |

## Context
What the problem is and what constraints exist. Facts, not opinions.

## Decision
What is decided, in present tense: "We use…".

## Consequences
- What is gained.
- What it costs or what risk remains.

## Discarded alternatives
- Option: why not.
```

## Statuses

| Status | Meaning |
| --- | --- |
| Proposed | In discussion |
| Accepted | In force |
| Superseded by NNNN | No longer applies; kept as history |
| Deferred | Evaluated and not part of the current plan; kept so it can be picked up |
| Rejected | Evaluated and not adopted |

An accepted ADR is not edited. If the decision changes, a new one is written and the previous one becomes "Superseded".
