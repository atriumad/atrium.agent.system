---
sidebar_position: 3.5
title: "Product theme"
description: "How the product interface differs from the brand, and the rules for data screens."
---

# Product *theme*

The Manager and the Platform use the Atrium brand as ink on paper: one cream for the page and the cards, cards drawn by a 1px outline instead of a fill or a shadow, and lime as the single highlighter swatch. The style borrows its discipline from Pirsch Analytics (flat, outlined, one accent) and keeps what is Atrium's: lime, clay, charcoal, Inter Tight, Instrument Serif, wide-caps labels and the marker highlight. The brand (the site and the design system in `atrium-docs`) does not change. The product layer lives in `packages/ui/src/tokens-product.css` and is loaded after `tokens.css`, so it only overrides values.

## What the product changes

| Token | Brand | Product |
| --- | --- | --- |
| `--surface-page` | `#f4eee2` | `#f8f5ed` |
| `--surface-card` | `#fbf8f1` | `#f8f5ed` (same as the page) |
| `--surface-sunken` | `#e9e1d1` | `#efe9dc` |
| `--border-frame` (new, `border-frame`) | none | `#242726`, the outline of cards, tables and tiles |
| Card radius (`rounded-card`) | 6px | 16px |
| Control radius (`rounded-control`): fields, small tiles | 4px | 6px |
| Buttons | 4px | pill (`rounded-full`) |

The primary button is lime with an ink edge: lime on cream is 1.4:1, so the edge is what shows the button. Status badges are outlined pills with a word and a mark, using the brand status colours. Each status foreground on its background is at least 4.5:1; a test enforces it. Tables are framed like cards, with no ink rule on top. An interactive card or row group lights up in lime wash on hover; it does not lift or cast a shadow.

Unchanged: lime, clay, charcoal, Inter Tight, the dark sidebar, the dark theme and motion. The dark theme keeps its own values: the product layer applies to a root that is not `data-atr-theme="dark"`, and a dark region swaps the ink outline for the dark hairline.

## Rules for product screens

- One lime primary action per screen. Outline buttons are the secondary.
- No shadow on content. Shadow is for popovers and menus.
- No white. The cream is the page and the card.
- Lime is a signal, not a fill for large areas. Clay is for errors and focus, never a button on a data screen.
- A status is never told by colour alone.

## The data page

A page of data is a header with at most one primary action, a `FilterBar`, and a `DataTable`.

- `useTableState` keeps the search, the filters, the sort and the page in the address (`?severity=high&sort=due:asc&page=2`). A link can be shared and the back button works. Pass it a stable `TableSpec`.
- `applyTableState` filters in the browser. Search is a plain substring match.
- `DataTable` pages 25 rows at a time, and the first cell of a row can be a link that covers the whole row.
- A filter that finds nothing is a different empty state from a table with no data, and it offers "Clear filters".

## The bell

The bell groups notifications by day, shows an icon for the kind, one line of context and the action the person is expected to take. A notification that carries a target opens that case, place or request; an older one opens the list. "See all" opens a data page with filters by type and read state.
