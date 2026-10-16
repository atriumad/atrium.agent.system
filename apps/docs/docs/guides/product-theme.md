---
sidebar_position: 3.5
title: "Product theme"
description: "How the product interface differs from the brand, and the rules for data screens."
---

# Product *theme*

The Manager and the Platform use the Atrium brand on a paper-and-card interface built for dense data. The brand (the site and the design system in `atrium-docs`) does not change. The product layer lives in `packages/ui/src/tokens-product.css` and is loaded after `tokens.css`, so it only overrides values.

## What the product changes

| Token | Brand | Product |
| --- | --- | --- |
| `--surface-page` | `#f4eee2` | `#f6f5f4` |
| `--surface-card` | `#fbf8f1` | `#ffffff` |
| `--surface-sunken` | `#e9e1d1` | `#f1efec` |
| `--border-light` | `#d4cab6` | `rgba(0, 0, 0, 0.08)` |
| Card radius (`rounded-card`) | 6px | 12px |
| Control radius (`rounded-control`) | 4px | 8px |

Status badges are pills with a word and a mark. Each status foreground on its background is at least 4.5:1; a test enforces it. Tables are framed like cards, with no ink rule on top.

Unchanged: lime, clay, charcoal, Inter Tight, the dark sidebar, the dark theme and motion. The dark theme is not overridden: the product layer applies to a root that is not `data-atr-theme="dark"`.

## Rules for product screens

- One dark primary action per screen.
- No shadow on content. Shadow is for popovers and menus.
- White is a card surface, never a page background.
- A status is never told by colour alone.

## The data page

A page of data is a header with at most one primary action, a `FilterBar`, and a `DataTable`.

- `useTableState` keeps the search, the filters, the sort and the page in the address (`?severity=high&sort=due:asc&page=2`). A link can be shared and the back button works. Pass it a stable `TableSpec`.
- `applyTableState` filters in the browser. Search is a plain substring match.
- `DataTable` pages 25 rows at a time, and the first cell of a row can be a link that covers the whole row.
- A filter that finds nothing is a different empty state from a table with no data, and it offers "Clear filters".

## The bell

The bell groups notifications by day, shows an icon for the kind, one line of context and the action the person is expected to take. A notification that carries a target opens that case, place or request; an older one opens the list. "See all" opens a data page with filters by type and read state.
