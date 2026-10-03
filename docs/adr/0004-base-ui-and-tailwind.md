---
id: 0004-base-ui-and-tailwind
sidebar_position: 5
title: "0004 · Base UI for primitives and Tailwind for styles"
sidebar_label: "0004 · Base UI for primitives and Tailwind for styles"
description: "Base UI for primitives and Tailwind for styles"
---

# ADR 0004: Base UI for primitives and Tailwind for styles

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-01 | Atrium · product and technology |

## Context

Atrium's product theme (cream, ink, lime, amber; Inter Tight and Instrument Serif) is defined in tokens. Accessible components with full control over styling are needed, and the charts must follow the brand.

## Decision

`@atrium/ui` builds the primitives on Base UI (unstyled, stable since v1) and applies the brand with Tailwind v4 from `theme.css`. The apps import components from `@atrium/ui`; they do not restyle primitives.

## Consequences

- Accessibility and behavior are handled by Base UI; the look is 100% the brand.
- A single primitives layer for Platform, Manager and Hub.
- The hub and the survey take each restaurant's colors and logo on top of the same components.

## Discarded alternatives

- Radix directly: less control over the primitives layer.
- Styled libraries (MUI, Chakra): fighting someone else's styles.
