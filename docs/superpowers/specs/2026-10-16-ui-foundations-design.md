# UI foundations: a product theme, a data page and a new bell

Date: 2026-10-16
Status: draft for review
Delivery 1 of 4 in the UI redesign. Later deliveries: Cases, Overview, Responses/Help/Places.

## Goal

Give the Manager and the Platform one visual system for data-heavy screens, and the three pieces every later screen needs: a product theme, a data page template, and a bell that opens the thing it is about.

Today the screens are lists of cards. The UI package already ships `DataTable`, `StatTile`, `Delta` and charts, and no page uses them. This delivery builds the shared pieces; deliveries 2 to 4 move the screens onto them.

## What was asked, and what I assumed

Asked: the notification panel should open the case or action that triggered a notification (done and committed as part A, with `?case=`, `?place=` and `?request=` links). The UI is visually chaotic; a dashboard should have tables and quick access to data. Overviews per section are fine, but full data views need to be rethought.

Decided in this design session:
- **Both apps, one system.** Manager (the agency's team) and Platform (the owner) share the components. Manager gets the work queue first because it has the most real data.
- **Hybrid style.** Take the surface hierarchy and density from the Notion reference; keep Atrium's lime, clay, charcoal, Inter Tight and the dark sidebar. Chosen from three mockups (A current, B hybrid with a charcoal action, C hybrid with a blue action). B won.
- **Overview** is a summary with a table per block and "View all →" links (layout 1 of three).
- **Full data views** are a full-width table with the detail on its own page (option B of two). The recommendation was a side panel; the choice was the page. Consequence: cases get a route, and the bell links change from `?case=<id>` to `/reputation/cases/<id>` in delivery 2.
- **Tokens live in a product-only layer** in this repo. `atrium-docs/src/design/tokens.ts` and the brand do not change.

Assumptions to confirm:
- The reference is a marketing page. Only its surfaces, density, status pills and table patterns apply; heroes, decorative marks and coloured feature cards do not.
- No CSV export in this delivery (see Out of scope).
- **Table frame.** Mockup B shows a table framed like a card (12px radius, hairline, no rule). Today `TableWrap` has a 3px ink rule on top. I told the user in the design session that this rule stays; the chosen mockup contradicts that. This spec follows the mockup and drops the rule from tables. The 3px rule stays elsewhere (section rules). To confirm in review.

## Where things are today

- `packages/ui/src/tokens.css` is copied from `atrium-docs`. It has a precedent for product-only deltas, annotated "product addition" (`--field-border`, `--clay-700`).
- Surfaces: page `#f4eee2`, card `#fbf8f1` ("there is no pure white"), line `#d4cab6`. Card radius 6px, controls 4px. `Card` uses `rounded-md`.
- `StatusBadge` is a squared label with a 3px left rule and a mark. `Chip` is the only pill.
- `DataTable` sorts, selects, and has loading and empty states. Rows are not navigable and there is no pagination.
- The bell (`shell/notifications.tsx`) shows a subject and a time. `notificationHref` already returns a page per kind and, with a target, the case, place or request.
- The dark theme is `[data-atr-theme="dark"]` in `tokens.css`.

## Roadmap

1. **Foundations** (this spec): product theme, data page template, bell.
2. **Cases**: a table page with Sentiment's reading, a `/reputation/cases/<id>` detail route, the API returning sentiment, topics and safety, and the bell links moved to the route.
3. **Overview** in both apps: figures with change against yesterday, blocks with a table, a chart. Needs aggregate endpoints.
4. **Responses, Help and Places** on the same table pattern.

Each delivery gets its own spec, plan and tests.

## Design

### 1. The product theme layer

A new file, `packages/ui/src/tokens-product.css`, imported by `theme.css` right after `tokens.css`. It only overrides values; it adds no colours.

| Token | Brand value | Product value |
| --- | --- | --- |
| `--surface-page` | `#f4eee2` | `#f6f5f4` |
| `--surface-card` | `#fbf8f1` | `#ffffff` |
| `--surface-sunken` | `#e9e1d1` | `#f1efec` |
| `--border-light` | `#d4cab6` | `rgba(0, 0, 0, 0.08)` |
| `--radius-card` (new) | 6px (`--radius-md`) | 12px |
| `--radius-control` (new) | 4px (`--radius-sm`) | 8px |

`--radius-md` and `--radius-sm` are not changed, because many components use them. `Card`, buttons and fields move to the new tokens, so the change is explicit and reviewable. Implementation lists every use of `rounded-md` and `rounded-sm` first.

Status badges become pills with a word and a mark, never colour alone. Each foreground and background pair is at least 4.5:1. The tightest is severity high, `#b8421f` on `#fde4df`, at 4.52.

Tables are framed like cards: 12px radius, a hairline, and no top rule. The 3px ink rule stays for section rules only.

Unchanged: lime, clay, charcoal, Inter Tight, the dark sidebar, the dark theme, motion.

Product rules, written into the Design docs:
- One dark primary action per screen.
- No shadow on content; shadow only on popovers and menus.
- White is a card surface, never a page background.

Risk: if `data-atr-theme="dark"` lands on the same element as `:root`, load order decides which wins. Check where it is applied; a test covers it.

### 2. The data page template

Built from existing parts plus three new ones.

- `PageHeader` (exists): title, description, at most one primary action.
- `FilterBar` (new): a search field, filter dropdowns (reusing `Select` and `Combobox`), active filters as removable chips, "Clear all", and a count such as "8 of 10".
- `DataTable` (extended): a navigable row, `rowHref`, with a real link in the first cell so keyboard and right-click work; client-side pagination of 25 rows.
- `useTableState` (new): search, filters, sort and page live in the URL (`?severity=high&status=active&sort=due:asc`). A link can be shared, back works, and it matches the bell links.

Decisions:
- Filtering and sorting run in the browser. Server-side paging waits until it is needed.
- Two empty states: "no data", and "your filters found nothing" with a "Clear filters" button.
- No column chooser, no density switch.
- On narrow screens the table scrolls horizontally with the first column pinned.

### 3. The bell

A popover of about 380px, in the product style.

- Header: "Notifications", tabs All and Unread, "Mark all as read".
- Grouped by day: Today, Yesterday, This week.
- Each row, in three lines: a type icon in a tinted square and the subject (bold if unread); one line of context from the first line of the body; the relative time and, on the right, the expected action ("Open case", "Review place", "Reply"). The action comes from the kind through a pure function; there is no backend change.
- Unread: a dot and a slightly darker background. Clicking opens the target and marks it read.
- Older rows with no target say "View list" and open the list, as today.
- "See all" goes to `/notifications`, which becomes a data page using section 2, with filters by type and read state.

Until the case route exists, links stay `?case=<id>`; delivery 2 swaps them by changing only `notificationHref`.

Accessibility: the panel is a dialog with focus trapped and Escape to close; the unread count is announced in a live region; colour is never the only mark of unread.

### 4. Testing, docs, rollout

Tests, with the package's existing `bun test` and Testing Library pattern:
- Contrast: compute the ratio of every status pair and fail below 4.5:1.
- Theme: `tokens-product.css` is imported after `tokens.css`; the key tokens have the expected values; the dark theme is not overridden.
- Components: `useTableState` (URL round trip), `FilterBar`, `DataTable` (navigable row, pagination, both empty states, keyboard), and the bell (grouping by day, tabs, action per kind, mark read).

Docs: a "Product theme" page in the Design section, in English and Spanish, with the token table, the three rules, and what stays brand. The bell page is updated for its new look.

Visual check: no regression tool exists, so both apps are reviewed in the browser, screen by screen, with screenshots before the delivery is called done.

Rollout: no flags and no migrations. Manager and Platform use the same package, so both change at once. Until deliveries 2 to 4, screens not yet converted keep their card structure on the new surfaces: consistent, not final. One commit per component, test first.

Done means: CI green, the docs build in both languages, and screenshots of both apps reviewed.

## Out of scope

- CSV export. Guests' comments are third-party data and exporting them needs per-role rules.
- Severity as structured data on a notification. Today it only travels inside the subject text; a reliable severity colour needs a new field.
- Server-side pagination, a column chooser, a density switch.
- Changing the brand tokens or `atrium-docs`.
- Moving any screen onto the new pieces (deliveries 2 to 4).

## Risks

- A current screen uses a radius or a surface in a way that looks broken on the new tokens. Mitigation: the radius change goes through new tokens, and the visual check covers every screen.
- The tightest contrast pair has 0.02 of margin. Mitigation: the contrast test.
- Two token sources (brand in `atrium-docs`, product in this repo). Mitigation: the product page in the Design docs states the line between them; promoting the layer to the brand is a separate step.
