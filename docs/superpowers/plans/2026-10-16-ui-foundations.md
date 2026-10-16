# UI Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Manager and the Platform a product theme, a data page template (filter bar, URL state, navigable and paged table) and a bell that shows what each notification is and what to do about it.

**Architecture:** A CSS layer (`tokens-product.css`) overrides the brand tokens for the product only; two new Tailwind radius tokens replace hard-wired radii on card-like surfaces and controls. `DataTable` gains a navigable row, controlled sort and paging. Pure functions hold the table state (parse, serialize, filter) and one hook binds them to the URL. The bell and the notifications page are rebuilt on those pieces.

**Tech Stack:** React 19, Tailwind v4 (`@theme`), Base UI, class-variance-authority, lucide-react, `bun test` with Testing Library and happy-dom (package `packages/ui`).

**Spec:** `docs/superpowers/specs/2026-10-16-ui-foundations-design.md`

## Global Constraints

- Work in `packages/ui` unless a task says otherwise. Run package tests from there: `cd packages/ui && bun test <file>`.
- Every status foreground on its background is at least 4.5:1. The tightest pair is severity high, `#b8421f` on `#fde4df`, at 4.52.
- Product surfaces: page `#f6f5f4`, card `#ffffff`, sunken `#f1efec`, line `rgba(0, 0, 0, 0.08)`. Card radius 12px (`rounded-card`), control radius 8px (`rounded-control`). `--radius-md` and `--radius-sm` do not change.
- Unchanged: lime, clay, charcoal, Inter Tight, the dark sidebar, the dark theme, motion. `atrium-docs` and `tokens.css` are not edited.
- No shadow on content; one dark primary action per screen; white is a card surface, never the page background.
- A status is told apart by a word and a mark, never by colour alone.
- Filtering, sorting and paging run in the browser. No CSV export, no column chooser, no density switch.
- Table state lives in the URL: `q`, one key per filter, `sort=<key>:<asc|desc>`, `page`. The default sort is not written to the URL; page 1 is not written.
- Code comments in English, matching the surrounding files. Biome formats (`bunx biome check --write packages/ui` from the repository root).
- Commit messages follow the repository's style (`feat(ui): ...`) and end with the attribution line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A stale link with a filter value that is not an option (`?severity=banana`) shows the "filters found nothing" state and a "Clear filters" way out, not a crash or a blank table. Pinned in Task 5 (`applyTableState`) and Task 6 (the chip falls back to the raw value).
- A page number past the last page (`?page=99`, or a filter that shrinks the list) shows the last page, not an empty table. Pinned in Task 4.
- Search text with regex characters (`(`, `[`, `\`) matches literally and never throws. Pinned in Task 5.
- A notification with no subject, an empty body, or a timestamp in the future still renders one sensible row. Pinned in Task 7.
- Marking everything read while on the "Unread" tab leaves an explanatory empty state, not a blank panel. Pinned in Task 7.

---

### Task 1: The product theme layer

**Files:**
- Create: `packages/ui/src/tokens-product.css`
- Modify: `packages/ui/src/theme.css:1-4` (imports) and the `@theme` block (radius tokens)
- Test: `packages/ui/tests/product-theme.test.ts`

**Interfaces:**
- Produces: CSS variables `--surface-page`, `--surface-card`, `--surface-sunken`, `--border-light`, and the five `--status-*-{fg,bg,line}` sets, overridden for `:root:not([data-atr-theme="dark"])`. Tailwind utilities `rounded-card` (12px) and `rounded-control` (8px).

- [ ] **Step 1: Write the failing test**

Create `packages/ui/tests/product-theme.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dir, "../src");
const read = (name: string) => readFileSync(join(src, name), "utf8");
const product = read("tokens-product.css");
const brand = read("tokens.css");
const theme = read("theme.css");

const tokenIn = (css: string, name: string): string => {
  const hit = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  const value = hit?.[1]?.trim();
  if (!value) throw new Error(`--${name} is not defined`);
  return value;
};

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => channel(Number.parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

describe("the product theme", () => {
  test("loads after the brand tokens, so it wins", () => {
    const brandAt = theme.indexOf('@import "./tokens.css"');
    const productAt = theme.indexOf('@import "./tokens-product.css"');
    expect(brandAt).toBeGreaterThan(-1);
    expect(productAt).toBeGreaterThan(brandAt);
  });

  test("sets the paper, card, sunken and line values", () => {
    expect(tokenIn(product, "surface-page")).toBe("#f6f5f4");
    expect(tokenIn(product, "surface-card")).toBe("#ffffff");
    expect(tokenIn(product, "surface-sunken")).toBe("#f1efec");
    expect(tokenIn(product, "border-light")).toBe("rgba(0, 0, 0, 0.08)");
  });

  test("defines the card and control radii as Tailwind theme tokens", () => {
    expect(theme).toContain("--radius-card: 12px");
    expect(theme).toContain("--radius-control: 8px");
    // The old radii other components rely on are untouched.
    expect(theme).toContain("--radius-md: 6px");
    expect(theme).toContain("--radius-sm: 4px");
  });

  test("leaves the dark theme alone", () => {
    expect(product).toContain(':root:not([data-atr-theme="dark"])');
    expect(product).not.toMatch(/^\[data-atr-theme/m);
  });

  test("every status pair is at least 4.5:1", () => {
    for (const status of ["positive", "warning", "danger", "info", "neutral"]) {
      const ratio = contrast(
        tokenIn(product, `status-${status}-fg`),
        tokenIn(product, `status-${status}-bg`),
      );
      expect([status, ratio >= 4.5]).toEqual([status, true]);
    }
  });

  test("muted text clears 4.5:1 on the page and on a card", () => {
    const muted = tokenIn(brand, "charcoal-500");
    for (const surface of ["surface-page", "surface-card"]) {
      expect([surface, contrast(muted, tokenIn(product, surface)) >= 4.5]).toEqual([surface, true]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/ui && bun test tests/product-theme.test.ts`
Expected: FAIL with `ENOENT ... tokens-product.css`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/ui/src/tokens-product.css`:

```css
/*
 * The product theme: the Atrium brand on a paper-and-card interface. It only overrides values from
 * tokens.css; it adds no colours. The brand (atrium-docs) does not change.
 *
 * Scoped to a root that is not dark, so a root with data-atr-theme="dark" keeps the dark values
 * from tokens.css. Rules of the product: one dark primary action per screen; no shadow on content;
 * white is a card surface, never a page background.
 */
:root:not([data-atr-theme="dark"]) {
  --surface-page: #f6f5f4;
  --surface-card: #ffffff;
  --surface-sunken: #f1efec;
  --border-light: rgba(0, 0, 0, 0.08);

  /* Status pairs, each at least 4.5:1. The tightest is danger, 4.52. */
  --status-positive-fg: #3d5200;
  --status-positive-bg: #eefbc9;
  --status-positive-line: #aedc33;
  --status-warning-fg: #1c1f1d;
  --status-warning-bg: #fdf0d5;
  --status-warning-line: #d9542b;
  --status-danger-fg: #b8421f;
  --status-danger-bg: #fde4df;
  --status-danger-line: #d9542b;
  --status-info-fg: #615d59;
  --status-info-bg: #f1efec;
  --status-info-line: #d4cab6;
  --status-neutral-fg: #615d59;
  --status-neutral-bg: #f6f5f4;
  --status-neutral-line: #d4cab6;
}
```

In `packages/ui/src/theme.css`, change the imports to:

```css
@import "tailwindcss";
@import "./fonts.css";
@import "./tokens.css";
@import "./tokens-product.css";
```

In the same file, inside the existing `@theme { ... }` block, right after the `--radius-lg: 10px;` line, add:

```css
  /* The product's shapes: cards and tables, and controls. */
  --radius-card: 12px;
  --radius-control: 8px;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/ui && bun test tests/product-theme.test.ts`
Expected: PASS, 6 tests. If a status pair fails, adjust only that pair's fg/bg in `tokens-product.css` until it reaches 4.5:1 and keep the spec's danger pair.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/tokens-product.css packages/ui/src/theme.css packages/ui/tests/product-theme.test.ts
git commit -m "feat(ui): the product theme layer and the card and control radii"
```

---

### Task 2: Card-like surfaces and controls use the new radii; fields go white

**Files:**
- Modify: `packages/ui/src/data/card.tsx:6`, `packages/ui/src/data/stat-tile.tsx:31`, `packages/ui/src/layout/list-panel.tsx:12`, `packages/ui/src/shell/overview.tsx:15`, `packages/ui/src/feedback/states.tsx:18`, `packages/ui/src/help-thread.tsx:574`, `packages/ui/src/actions/button.tsx:11`, `packages/ui/src/forms/styles.ts:3`, `packages/ui/src/surveys-app.tsx:203`
- Test: `packages/ui/tests/data.test.tsx:31`, `packages/ui/tests/forms.test.tsx:62`, `packages/ui/tests/brand-actions.test.tsx:91`

**Interfaces:**
- Consumes: `rounded-card`, `rounded-control` (Task 1).
- Produces: `Card`, `StatTile`, `ListPanel`, the overview tile, `EmptyState`, the help panel use `rounded-card`; `Button` and every field control (`controlBase`) use `rounded-control`; fields sit on `bg-surface-card`.

- [ ] **Step 1: Update the existing expectations so they fail**

Run this from the repository root:

```bash
python3 -I - <<'EOF'
def sub(path, old, new):
    s = open(path).read()
    assert s.count(old) == 1, (path, old, s.count(old))
    open(path, "w").write(s.replace(old, new))

sub("packages/ui/tests/data.test.tsx",
    '    expect(card.className).toContain("rounded-md");',
    '    expect(card.className).toContain("rounded-card");')
sub("packages/ui/tests/forms.test.tsx",
    '    expect(cls).toContain("rounded-sm");',
    '    expect(cls).toContain("rounded-control");\n'
    '    expect(cls).toContain("bg-surface-card");\n'
    '    expect(cls).not.toContain("bg-cream-100");')
sub("packages/ui/tests/brand-actions.test.tsx",
    '    expect(screen.getByRole("button").className).toContain("rounded-sm");',
    '    expect(screen.getByRole("button").className).toContain("rounded-control");')
EOF
```

- [ ] **Step 2: Run the three test files to verify they fail**

Run: `cd packages/ui && bun test tests/data.test.tsx tests/forms.test.tsx tests/brand-actions.test.tsx`
Expected: FAIL on the three changed expectations.

- [ ] **Step 3: Move the components to the new tokens**

Run this from the repository root:

```bash
python3 -I - <<'EOF'
def sub(path, old, new):
    s = open(path).read()
    assert s.count(old) == 1, (path, old, s.count(old))
    open(path, "w").write(s.replace(old, new))

sub("packages/ui/src/data/card.tsx",
    '"relative rounded-md border transition-', '"relative rounded-card border transition-')
sub("packages/ui/src/data/stat-tile.tsx",
    "gap-2 rounded-md border border-line bg-surface-card p-5",
    "gap-2 rounded-card border border-line bg-surface-card p-5")
sub("packages/ui/src/layout/list-panel.tsx",
    "overflow-hidden rounded-md border border-line", "overflow-hidden rounded-card border border-line")
sub("packages/ui/src/shell/overview.tsx",
    "gap-1 rounded-md border border-line bg-surface-card p-5",
    "gap-1 rounded-card border border-line bg-surface-card p-5")
sub("packages/ui/src/feedback/states.tsx",
    "gap-2 rounded-md border border-dashed", "gap-2 rounded-card border border-dashed")
sub("packages/ui/src/help-thread.tsx",
    "gap-4 rounded-md border border-line bg-surface-card p-5",
    "gap-4 rounded-card border border-line bg-surface-card p-5")
sub("packages/ui/src/actions/button.tsx",
    '"inline-flex items-center justify-center rounded-sm border font-medium',
    '"inline-flex items-center justify-center rounded-control border font-medium')
sub("packages/ui/src/forms/styles.ts",
    '"w-full rounded-sm border border-field bg-cream-100',
    '"w-full rounded-control border border-field bg-surface-card')
sub("packages/ui/src/surveys-app.tsx",
    "rounded-sm border border-line bg-cream-100 p-3", "rounded-control border border-line bg-surface-card p-3")
EOF
```

- [ ] **Step 4: Run the whole package to verify it passes**

Run: `cd packages/ui && bun test`
Expected: PASS, no failures. If another test asserted one of the replaced classes, update only that expectation to the new class.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): cards and tables take the card radius, controls the control radius, fields go white"
```

---

### Task 3: Status badges are pills

**Files:**
- Modify: `packages/ui/src/feedback/badge.tsx:8-55` (the `STATUS` map and `StatusBadge`)
- Test: `packages/ui/tests/feedback.test.tsx` (inside `describe("Badge and StatusBadge")`)

**Interfaces:**
- Produces: `StatusBadge` renders a `rounded-full` span with a glyph (or a dot) and the word, and no inset left rule. Props unchanged.

- [ ] **Step 1: Write the failing test**

In `packages/ui/tests/feedback.test.tsx`, inside `describe("Badge and StatusBadge", ...)`, after the test `"a status always has a word and a mark"`, add:

```tsx
  test("a status is a pill with a word and a mark, not a squared label with a left rule", () => {
    setup(<StatusBadge status="danger">Overdue</StatusBadge>);
    const pill = screen.getByText("Overdue");
    expect(pill.className).toContain("rounded-full");
    expect(pill.className).not.toContain("inset_3px");
    expect(pill.querySelector("svg")).toBeTruthy();
  });

  test("a steady status in a dense table can use a dot instead of an icon", () => {
    setup(
      <StatusBadge status="positive" dot>
        Active
      </StatusBadge>,
    );
    const pill = screen.getByText("Active");
    expect(pill.querySelector("svg")).toBeNull();
    expect(pill.className).toContain("rounded-full");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/ui && bun test tests/feedback.test.tsx -t "pill"`
Expected: FAIL (`rounded-full` missing, `inset_3px` present).

- [ ] **Step 3: Write the minimal implementation**

In `packages/ui/src/feedback/badge.tsx`, replace the `STATUS` constant with:

```tsx
const STATUS: Record<Status, string> = {
  positive: "bg-status-positive-bg text-status-positive-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  danger: "bg-status-danger-bg text-status-danger-fg",
  info: "bg-status-info-bg text-status-info-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
};
```

and change the `className` of the `StatusBadge` span from
`cx(badgeStyles({ variant: null }), "pl-2.5", STATUS[status], className)` to:

```tsx
      className={cx(badgeStyles({ variant: null }), "rounded-full px-2.5", STATUS[status], className)}
```

Also update the doc comment above `StatusBadge` to: `/** A status told apart by a pill fill and a mark, and always with a word: color never speaks alone. ... */` keeping the sentence about the icon and the dot.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/ui && bun test tests/feedback.test.tsx`
Expected: PASS. `Badge` (squared) keeps its `rounded-xs` test.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/feedback/badge.tsx packages/ui/tests/feedback.test.tsx
git commit -m "feat(ui): status badges are pills with a word and a mark"
```

---

### Task 4: The table frame, and DataTable rows that navigate, sort from outside and page

**Files:**
- Modify: `packages/ui/src/data/table.tsx` (`TableWrap`, `Tr`, `Th`), `packages/ui/src/data/data-table.tsx`
- Test: `packages/ui/tests/data.test.tsx` (append a new `describe`)

**Interfaces:**
- Produces, exported from `data-table.tsx`:
  - `export type Sort = { key: string; dir: "asc" | "desc" }`
  - New `DataTableProps<Row>` fields: `rowHref?: (row: Row) => string | null`, `onRowOpen?: (row: Row) => void`, `linkAs?: ElementType`, `sort?: Sort | null`, `onSortChange?: (sort: Sort | null) => void`, `pageSize?: number` (default 25), `page?: number` (1-based), `onPageChange?: (page: number) => void`.
- Behaviour: the first data cell of a row with an href is a link that covers the whole row; sorting is controlled when `sort` is given; a pager shows only when rows exceed `pageSize`; the page is clamped to the last page; "select all" acts on the visible page.

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/tests/data.test.tsx`:

```tsx
describe("DataTable as a page of data", () => {
  type Place = { id: string; name: string; n: number };
  const many: Place[] = Array.from({ length: 30 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Place ${i + 1}`,
    n: i + 1,
  }));
  const cols = [
    { key: "name", header: "Name", cell: (r: Place) => r.name, sortValue: (r: Place) => r.name },
    {
      key: "n",
      header: "Number",
      cell: (r: Place) => String(r.n),
      numeric: true,
      sortValue: (r: Place) => r.n,
    },
  ];
  const firstRow = () => screen.getAllByRole("row")[1]?.textContent ?? "";

  test("the first cell of a row is a link to where the row goes", () => {
    setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 3)}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={(r) => `/places/${r.id}`}
      />,
    );
    const link = screen.getByRole("link", { name: "Place 1" });
    expect(link.getAttribute("href")).toBe("/places/p1");
    link.focus();
    expect(document.activeElement).toBe(link);
    // Only the first data cell links; the number is plain text.
    expect(screen.getAllByRole("link").length).toBe(3);
  });

  test("a row with no destination is plain text, and opening a row is reported", async () => {
    const onRowOpen = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 2)}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={(r) => (r.id === "p1" ? "/places/p1" : null)}
        onRowOpen={onRowOpen}
      />,
    );
    expect(screen.getAllByRole("link").length).toBe(1);
    await user.click(screen.getByRole("link", { name: "Place 1" }));
    expect(onRowOpen).toHaveBeenCalledWith(many[0]);
  });

  test("pages the rows and says where you are", async () => {
    const { user } = setup(
      <DataTable label="Places" rows={many} columns={cols} rowKey={(r) => r.id} pageSize={10} />,
    );
    expect(screen.getAllByRole("row").length).toBe(11);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous page" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(firstRow()).toContain("Place 11");
  });

  test("no pager when everything fits on one page", () => {
    setup(<DataTable label="Places" rows={many.slice(0, 5)} columns={cols} rowKey={(r) => r.id} />);
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  test("a page past the end shows the last page, not an empty table", () => {
    setup(
      <DataTable
        label="Places"
        rows={many}
        columns={cols}
        rowKey={(r) => r.id}
        pageSize={10}
        page={99}
      />,
    );
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    expect(firstRow()).toContain("Place 21");
  });

  test("a controlled page reports the next one", async () => {
    const onPageChange = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many}
        columns={cols}
        rowKey={(r) => r.id}
        pageSize={10}
        page={2}
        onPageChange={onPageChange}
      />,
    );
    expect(firstRow()).toContain("Place 11");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  test("a controlled sort is shown and reported", async () => {
    const onSortChange = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many}
        columns={cols}
        rowKey={(r) => r.id}
        sort={{ key: "n", dir: "desc" }}
        onSortChange={onSortChange}
      />,
    );
    expect(firstRow()).toContain("Place 30");
    expect(screen.getByRole("columnheader", { name: "Number" }).getAttribute("aria-sort")).toBe(
      "descending",
    );
    await user.click(screen.getByRole("button", { name: "Number" }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "n", dir: "asc" });
  });

  test("select all acts on the visible page only", async () => {
    const onSelectedChange = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many}
        columns={cols}
        rowKey={(r) => r.id}
        pageSize={10}
        selectable
        onSelectedChange={onSelectedChange}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    expect(onSelectedChange.mock.calls[0]?.[0]).toEqual(many.slice(0, 10).map((r) => r.id));
  });

  test("on a narrow screen the first column stays put while the table scrolls", () => {
    setup(<DataTable label="Places" rows={many.slice(0, 2)} columns={cols} rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: "Name" }).className).toContain("max-md:sticky");
    expect(screen.getByRole("cell", { name: "Place 1" }).className).toContain("max-md:sticky");
    expect(screen.getByRole("columnheader", { name: "Number" }).className).not.toContain(
      "max-md:sticky",
    );
  });

  test("the table is a card: hairline frame, no ink rule on top", () => {
    setup(<DataTable label="Places" rows={many.slice(0, 2)} columns={cols} rowKey={(r) => r.id} />);
    const wrap = screen.getByRole("table").parentElement;
    expect(wrap?.className).toContain("rounded-card");
    expect(wrap?.className).not.toContain("border-t-[3px]");
  });
});
```

Make sure `mock` is imported at the top of the file: the first line should be `import { describe, expect, mock, test } from "bun:test";` (add `mock` if missing).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/ui && bun test tests/data.test.tsx -t "page of data"`
Expected: FAIL (no `rowHref`, no pager, wrap still has the ink rule).

- [ ] **Step 3: Write the minimal implementation**

In `packages/ui/src/data/table.tsx`:

Replace `TableWrap` with:

```tsx
/** A table is framed like a card: a hairline, the card radius, and headers over a hairline. */
export function TableWrap({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "overflow-x-auto rounded-card border border-line bg-surface-card",
        className,
      )}
      {...rest}
    />
  );
}
```

In `Tr`, add `relative` to the class list: `"relative hover:bg-surface-sunken aria-selected:bg-lime-100 dark:aria-selected:bg-charcoal-700"`.

In `Th`, replace `border-line-strong` with `border-line`.

In `packages/ui/src/data/data-table.tsx`:

1. Change the imports to `import { type ElementType, type ReactNode, useMemo, useState } from "react";`, and add `import { Button } from "../actions/button";`.
2. Export the sort type: change `type Sort = { key: string; dir: "asc" | "desc" };` to `export type Sort = { key: string; dir: "asc" | "desc" };`.
3. Add to `DataTableProps<Row>` (before `className`):

```tsx
  /** Where a row goes. The first data cell becomes a link and the whole row is its click target. */
  rowHref?: (row: Row) => string | null;
  /** Called when the link of a row is used, before the browser follows it. */
  onRowOpen?: (row: Row) => void;
  /** The link component, for a router link. A plain anchor by default. */
  linkAs?: ElementType;
  /** Controlled sort. Without it the table keeps its own. */
  sort?: Sort | null;
  onSortChange?: (sort: Sort | null) => void;
  /** Rows per page. A pager shows only when there are more rows than this. */
  pageSize?: number;
  /** The current page, 1-based. Without it the table keeps its own. */
  page?: number;
  onPageChange?: (page: number) => void;
```

4. Replace the function signature destructuring and the first lines of the body. The destructuring becomes:

```tsx
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  label,
  selectable,
  selected,
  onSelectedChange,
  empty,
  loading,
  className,
  rowHref,
  onRowOpen,
  linkAs: LinkAs = "a",
  sort: sortProp,
  onSortChange,
  pageSize = 25,
  page: pageProp,
  onPageChange,
}: DataTableProps<Row>) {
  const [innerSort, setInnerSort] = useState<Sort | null>(null);
  const sort = sortProp !== undefined ? sortProp : innerSort;
  const setSort = (next: Sort | null) => {
    if (sortProp === undefined) setInnerSort(next);
    onSortChange?.(next);
  };
  const [innerPage, setInnerPage] = useState(1);
  const [inner, setInner] = useState<string[]>([]);
  const chosen = selected ?? inner;
  const setChosen = (keys: string[]) => {
    if (selected === undefined) setInner(keys);
    onSelectedChange?.(keys);
  };
```

5. After the existing `sorted` `useMemo`, replace the `keys`/`all`/`some` lines with:

```tsx
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(Math.max(1, pageProp ?? innerPage), pages);
  const goTo = (next: number) => {
    if (pageProp === undefined) setInnerPage(next);
    onPageChange?.(next);
  };
  const visible = sorted.slice((current - 1) * pageSize, current * pageSize);
  const keys = visible.map(rowKey);
  const all = keys.length > 0 && keys.every((k) => chosen.includes(k));
  const some = keys.some((k) => chosen.includes(k));
```

6. In the header `onClick`, keep calling `setSort({...})` (it now resolves to the new `setSort`). In the body, replace `sorted.map((row) => {` with `visible.map((row) => {`.
7. Give the checkbox cell a stacking order above the row link: change `<Td>` that wraps the row checkbox to `<Td className="relative z-10">` (the header `Th className="w-10"` stays).
8. Replace the data cells map:

```tsx
                    {columns.map((c, i) => {
                      const href = i === 0 && rowHref ? rowHref(row) : null;
                      return (
                        <Td key={c.key} numeric={c.numeric}>
                          {href ? (
                            <LinkAs
                              href={href}
                              onClick={() => onRowOpen?.(row)}
                              className="font-medium text-fg-strong no-underline before:absolute before:inset-0 before:content-[''] hover:underline focus-visible:underline"
                            >
                              {c.cell(row)}
                            </LinkAs>
                          ) : (
                            c.cell(row)
                          )}
                        </Td>
                      );
                    })}
```

9. Pin the first column on narrow screens. In the header map, change `<Th key={c.key} className={cx(c.numeric && "text-right")}` to:

```tsx
              <Th
                key={c.key}
                className={cx(
                  c.numeric && "text-right",
                  columns[0]?.key === c.key && "max-md:sticky max-md:left-0 max-md:bg-surface-card",
                )}
```

(keep the `aria-sort` prop and the children as they are), and in the body replace `<Td key={c.key} numeric={c.numeric}>` with:

```tsx
                        <Td
                          key={c.key}
                          numeric={c.numeric}
                          className={cx(i === 0 && "max-md:sticky max-md:left-0 max-md:bg-surface-card")}
                        >
```

On a narrow screen the pinned cell is a positioned element, so the row link covers that cell rather than the whole row; that is accepted.

10. Wrap the returned table and add the pager. First move the existing `<Table aria-label={label} aria-busy={loading || undefined}> ... </Table>` element, unchanged, into a constant just above the `return`: `const table = (<Table ...> ... </Table>);`. Then replace the old `return ( <TableWrap ...> ... </TableWrap> );` with:

```tsx
  return (
    <div className="flex flex-col gap-3">
      <TableWrap className={className}>{table}</TableWrap>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-3 text-sm">
          <Button
            variant="ghost"
            size="sm"
            disabled={current <= 1}
            onClick={() => goTo(current - 1)}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <span className="tabular-nums text-fg-muted">
            Page {current} of {pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={current >= pages}
            onClick={() => goTo(current + 1)}
            aria-label="Next page"
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/ui && bun test tests/data.test.tsx`
Expected: PASS, including the older `DataTable` tests. Then `bun run typecheck` from the repository root: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/data packages/ui/tests/data.test.tsx
git commit -m "feat(ui): DataTable rows navigate, sort from outside and page; tables are framed like cards"
```

---

### Task 5: Table state, in pure functions and a URL hook

**Files:**
- Create: `packages/ui/src/data/table-state.ts`, `packages/ui/src/data/use-table-state.ts`
- Modify: `packages/ui/src/data/index.ts` (two exports)
- Test: `packages/ui/tests/table-state.test.tsx`

**Interfaces:**
- Consumes: `Sort` from `./data-table` (Task 4).
- Produces:
  - `type TableSpec = { filterKeys: string[]; defaultSort?: Sort }`
  - `type TableState = { q: string; filters: Record<string, string>; sort: Sort | null; page: number }`
  - `parseTableState(search: string, spec: TableSpec): TableState`
  - `serializeTableState(state: TableState, spec: TableSpec): string` (returns `""` or `"?..."`)
  - `type RowSpec<Row> = { searchText: (row: Row) => string; filterValue: Record<string, (row: Row) => string> }`
  - `applyTableState<Row>(rows: Row[], state: TableState, spec: RowSpec<Row>): Row[]`
  - `useTableState(spec: TableSpec): { state: TableState; setSearch(q: string): void; setFilter(key: string, value: string | null): void; clearFilters(): void; setSort(sort: Sort | null): void; setPage(page: number): void }`. `spec` must be a stable reference (a module constant).

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/tests/table-state.test.tsx`:

```tsx
import { afterEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { applyTableState, parseTableState, serializeTableState, type TableSpec } from "../src/data/table-state";
import { useTableState } from "../src/data/use-table-state";

const SPEC: TableSpec = { filterKeys: ["severity", "status"], defaultSort: { key: "due", dir: "asc" } };

afterEach(() => window.history.replaceState(null, "", "/"));

describe("parseTableState and serializeTableState", () => {
  test("an empty address is the default state", () => {
    expect(parseTableState("", SPEC)).toEqual({
      q: "",
      filters: {},
      sort: { key: "due", dir: "asc" },
      page: 1,
    });
  });

  test("round trips search, filters, sort and page", () => {
    const state = {
      q: "soup",
      filters: { severity: "high", status: "open" },
      sort: { key: "rating", dir: "desc" as const },
      page: 3,
    };
    const url = serializeTableState(state, SPEC);
    expect(url).toBe("?q=soup&severity=high&status=open&sort=rating%3Adesc&page=3");
    expect(parseTableState(url, SPEC)).toEqual(state);
  });

  test("the default sort and page 1 are not written", () => {
    expect(
      serializeTableState({ q: "", filters: {}, sort: { key: "due", dir: "asc" }, page: 1 }, SPEC),
    ).toBe("");
  });

  test("keys the page does not offer, a bad sort and a bad page are ignored", () => {
    const state = parseTableState("?color=red&sort=due:sideways&page=-4&severity=low", SPEC);
    expect(state.filters).toEqual({ severity: "low" });
    expect(state.sort).toEqual({ key: "due", dir: "asc" });
    expect(state.page).toBe(1);
    expect(parseTableState("?page=2.5", SPEC).page).toBe(1);
  });
});

describe("applyTableState", () => {
  type Row = { id: string; text: string; severity: string };
  const rows: Row[] = [
    { id: "1", text: "Cold soup (again)", severity: "high" },
    { id: "2", text: "Long wait [45 min]", severity: "low" },
    { id: "3", text: "Great evening", severity: "low" },
  ];
  const spec = {
    searchText: (r: Row) => r.text,
    filterValue: { severity: (r: Row) => r.severity },
  };
  const state = (over: Partial<ReturnType<typeof parseTableState>>) => ({
    ...parseTableState("", SPEC),
    ...over,
  });

  test("search is case-insensitive and filters combine", () => {
    expect(applyTableState(rows, state({ q: "SOUP" }), spec).map((r) => r.id)).toEqual(["1"]);
    expect(
      applyTableState(rows, state({ filters: { severity: "low" } }), spec).map((r) => r.id),
    ).toEqual(["2", "3"]);
    expect(
      applyTableState(rows, state({ q: "wait", filters: { severity: "low" } }), spec).map(
        (r) => r.id,
      ),
    ).toEqual(["2"]);
  });

  test("search text with regex characters matches literally and never throws", () => {
    expect(applyTableState(rows, state({ q: "(again)" }), spec).map((r) => r.id)).toEqual(["1"]);
    expect(applyTableState(rows, state({ q: "[45" }), spec).map((r) => r.id)).toEqual(["2"]);
    expect(applyTableState(rows, state({ q: "\\" }), spec)).toEqual([]);
  });

  test("a filter value that is not an option finds nothing, it does not crash", () => {
    expect(applyTableState(rows, state({ filters: { severity: "banana" } }), spec)).toEqual([]);
  });
});

describe("useTableState", () => {
  test("reads the address on mount", () => {
    window.history.replaceState(null, "", "/?severity=high&page=2");
    const { result } = renderHook(() => useTableState(SPEC));
    expect(result.current.state.filters).toEqual({ severity: "high" });
    expect(result.current.state.page).toBe(2);
  });

  test("a filter change writes the address and goes back to page 1", () => {
    window.history.replaceState(null, "", "/?page=3");
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => result.current.setFilter("status", "open"));
    expect(window.location.search).toBe("?status=open");
    expect(result.current.state.page).toBe(1);
    act(() => result.current.setFilter("status", null));
    expect(window.location.search).toBe("");
  });

  test("clear removes search and filters but keeps the sort", () => {
    window.history.replaceState(null, "", "/?q=a&severity=high&sort=rating:desc");
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => result.current.clearFilters());
    expect(window.location.search).toBe("?sort=rating%3Adesc");
    expect(result.current.state.q).toBe("");
  });

  test("setSort and setPage write the address", () => {
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => result.current.setSort({ key: "rating", dir: "desc" }));
    act(() => result.current.setPage(2));
    expect(window.location.search).toBe("?sort=rating%3Adesc&page=2");
  });

  test("the back button restores the earlier state", () => {
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => {
      window.history.pushState(null, "", "/?q=soup");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.state.q).toBe("soup");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/ui && bun test tests/table-state.test.tsx`
Expected: FAIL with `Cannot find module '../src/data/table-state'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/ui/src/data/table-state.ts`:

```ts
import type { Sort } from "./data-table";

export type TableSpec = {
  /** The filter keys the page offers. Anything else in the address is ignored. */
  filterKeys: string[];
  /** The sort a page opens with. It is not written to the address. */
  defaultSort?: Sort;
};

export type TableState = {
  q: string;
  filters: Record<string, string>;
  sort: Sort | null;
  page: number;
};

export function parseTableState(search: string, spec: TableSpec): TableState {
  const params = new URLSearchParams(search);
  const filters: Record<string, string> = {};
  for (const key of spec.filterKeys) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  let sort: Sort | null = spec.defaultSort ?? null;
  const raw = params.get("sort");
  if (raw) {
    const [key, dir] = raw.split(":");
    if (key && (dir === "asc" || dir === "desc")) sort = { key, dir };
  }
  const page = Number(params.get("page"));
  return {
    q: params.get("q") ?? "",
    filters,
    sort,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The query string for a state: empty, or starting with "?". The default sort and page 1 are left out. */
export function serializeTableState(state: TableState, spec: TableSpec): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  for (const key of spec.filterKeys) {
    const value = state.filters[key];
    if (value) params.set(key, value);
  }
  const fallback = spec.defaultSort;
  const isDefault =
    state.sort && fallback && state.sort.key === fallback.key && state.sort.dir === fallback.dir;
  if (state.sort && !isDefault) params.set("sort", `${state.sort.key}:${state.sort.dir}`);
  if (state.page > 1) params.set("page", String(state.page));
  const out = params.toString();
  return out ? `?${out}` : "";
}

export type RowSpec<Row> = {
  /** The text a search matches against. */
  searchText: (row: Row) => string;
  /** The value of each filter for a row. A filter with no entry here is ignored. */
  filterValue: Record<string, (row: Row) => string>;
};

/** Search and filters, in the browser. Search is a plain substring match, never a pattern. */
export function applyTableState<Row>(rows: Row[], state: TableState, spec: RowSpec<Row>): Row[] {
  const q = state.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !spec.searchText(row).toLowerCase().includes(q)) return false;
    for (const [key, wanted] of Object.entries(state.filters)) {
      const read = spec.filterValue[key];
      if (read && read(row) !== wanted) return false;
    }
    return true;
  });
}
```

Create `packages/ui/src/data/use-table-state.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sort } from "./data-table";
import { parseTableState, serializeTableState, type TableSpec, type TableState } from "./table-state";

/**
 * Search, filters, sort and page of a data page, kept in the address so a link can be shared and
 * the back button works. Pass a stable `spec` (a module constant). Typing in the search box
 * replaces the history entry; every other change adds one.
 */
export function useTableState(spec: TableSpec) {
  const [state, setState] = useState<TableState>(() => parseTableState("", spec));
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    const read = () => setState(parseTableState(window.location.search, spec));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [spec]);

  const commit = useCallback(
    (next: TableState, mode: "push" | "replace") => {
      current.current = next;
      setState(next);
      const url = `${window.location.pathname}${serializeTableState(next, spec)}${window.location.hash}`;
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [spec],
  );

  return {
    state,
    setSearch: (q: string) => commit({ ...current.current, q, page: 1 }, "replace"),
    setFilter: (key: string, value: string | null) => {
      const filters = { ...current.current.filters };
      if (value) filters[key] = value;
      else delete filters[key];
      commit({ ...current.current, filters, page: 1 }, "push");
    },
    clearFilters: () => commit({ ...current.current, q: "", filters: {}, page: 1 }, "push"),
    setSort: (sort: Sort | null) => commit({ ...current.current, sort, page: 1 }, "push"),
    setPage: (page: number) => commit({ ...current.current, page }, "push"),
  };
}
```

In `packages/ui/src/data/index.ts` add:

```ts
export * from "./table-state";
export * from "./use-table-state";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/ui && bun test tests/table-state.test.tsx`
Expected: PASS. Then `bun run typecheck` from the repository root: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/data packages/ui/tests/table-state.test.tsx
git commit -m "feat(ui): table state in the address, with pure parse, serialize and filter functions"
```

---

### Task 6: FilterBar

**Files:**
- Create: `packages/ui/src/data/filter-bar.tsx`
- Modify: `packages/ui/src/data/index.ts` (one export)
- Test: `packages/ui/tests/filter-bar.test.tsx`

**Interfaces:**
- Consumes: `SearchInput` (`../forms/input`), `Select` and `Option` (`../forms/select`), `Chip` (`../actions/chip`), `Button` (`../actions/button`).
- Produces: `type FilterDef = { key: string; label: string; options: Option[]; value: string | null; onChange: (value: string | null) => void }`, and `FilterBar({ search: { value, onChange(value: string), label?, placeholder? }, filters: FilterDef[], shown: number, total: number, onClear: () => void })`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/tests/filter-bar.test.tsx`:

```tsx
import { describe, expect, mock, test } from "bun:test";
import { FilterBar, type FilterDef } from "../src/data/filter-bar";
import { screen, setup, waitFor } from "./helpers";

const severity = (over: Partial<FilterDef> = {}): FilterDef => ({
  key: "severity",
  label: "Severity",
  options: [
    { value: "high", label: "High" },
    { value: "low", label: "Low" },
  ],
  value: null,
  onChange: () => {},
  ...over,
});

const bar = (over: Record<string, unknown> = {}) => ({
  search: { value: "", onChange: mock() },
  filters: [severity()],
  shown: 8,
  total: 10,
  onClear: mock(),
  ...over,
});

describe("FilterBar", () => {
  test("typing in the search box reports the text", async () => {
    const props = bar();
    const { user } = setup(<FilterBar {...props} />);
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "a");
    expect(props.search.onChange).toHaveBeenCalledWith("a");
  });

  test("choosing a filter option reports it", async () => {
    const onChange = mock();
    const { user } = setup(<FilterBar {...bar({ filters: [severity({ onChange })] })} />);
    await user.click(screen.getByRole("combobox", { name: "Severity" }));
    await user.click(await screen.findByRole("option", { name: "High" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0]?.[0]).toBe("high");
  });

  test("says how many of how many are shown, politely", () => {
    setup(<FilterBar {...bar()} />);
    expect(screen.getByRole("status").textContent).toBe("8 of 10");
  });

  test("with nothing filtered it shows the total alone and no chips or clear button", () => {
    setup(<FilterBar {...bar({ shown: 10 })} />);
    expect(screen.getByRole("status").textContent).toBe("10");
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  test("an active filter is a removable chip", async () => {
    const onChange = mock();
    const { user } = setup(
      <FilterBar {...bar({ filters: [severity({ value: "high", onChange })] })} />,
    );
    expect(screen.getByText("Severity: High")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove filter Severity" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("a stale filter value that is not an option shows the raw value", () => {
    setup(<FilterBar {...bar({ filters: [severity({ value: "banana" })] })} />);
    expect(screen.getByText("Severity: banana")).toBeTruthy();
  });

  test("clear all appears with a search or a filter and clears both", async () => {
    const props = bar({ search: { value: "soup", onChange: mock() } });
    const { user } = setup(<FilterBar {...props} />);
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(props.onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/ui && bun test tests/filter-bar.test.tsx`
Expected: FAIL with `Cannot find module '../src/data/filter-bar'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/ui/src/data/filter-bar.tsx`:

```tsx
"use client";

import { Button } from "../actions/button";
import { Chip } from "../actions/chip";
import { SearchInput } from "../forms/input";
import { type Option, Select } from "../forms/select";

export type FilterDef = {
  key: string;
  label: string;
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
};

export type FilterBarProps = {
  search: {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
  };
  filters: FilterDef[];
  /** Rows that match now, and rows there are. */
  shown: number;
  total: number;
  onClear: () => void;
};

/** Search, filter dropdowns, the active filters as removable chips, and how many rows match. */
export function FilterBar({ search, filters, shown, total, onClear }: FilterBarProps) {
  const active = filters.filter((f) => f.value);
  const dirty = search.value !== "" || active.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="w-full sm:w-64"
          label={search.label ?? "Search"}
          placeholder={search.placeholder ?? "Search"}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
        />
        {filters.map((f) => (
          <Select
            key={f.key}
            aria-label={f.label}
            className="w-auto min-w-36"
            placeholder={f.label}
            options={f.options}
            value={f.value}
            onValueChange={f.onChange}
          />
        ))}
        <p role="status" className="m-0 ml-auto text-sm tabular-nums text-fg-muted">
          {shown === total ? `${total}` : `${shown} of ${total}`}
        </p>
      </div>
      {dirty ? (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((f) => {
            const word = f.options.find((o) => o.value === f.value)?.label ?? f.value;
            return (
              <Chip
                key={f.key}
                variant="outline"
                size="sm"
                onRemove={() => f.onChange(null)}
                removeLabel={`Remove filter ${f.label}`}
              >
                {f.label}: {word}
              </Chip>
            );
          })}
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

Add `export * from "./filter-bar";` to `packages/ui/src/data/index.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/ui && bun test tests/filter-bar.test.tsx`
Expected: PASS. Then `bun run typecheck` from the repository root. If `onChange={(e) => ...}` on `SearchInput` does not type-check against `InputProps`, type the handler as `(e: React.ChangeEvent<HTMLInputElement>) => void`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/data packages/ui/tests/filter-bar.test.tsx
git commit -m "feat(ui): FilterBar with search, filters, active chips and a count"
```

---

### Task 7: The bell: types, days, actions

**Files:**
- Create: `packages/ui/src/shell/notification-view.ts`
- Modify: `packages/ui/src/shell/notifications.tsx` (`Row`, `NotificationsMenu`; imports)
- Test: `packages/ui/tests/notification-view.test.ts`, `packages/ui/tests/notifications.test.tsx` (extend)

**Interfaces:**
- Consumes: `AppNotification` (`../api`), `Tabs` (`../navigation/tabs`).
- Produces, from `notification-view.ts`:
  - `type NotificationType = "case" | "place" | "help" | "other"`
  - `notificationType(kind: string): NotificationType`
  - `notificationAction(kind: string, target: AppNotification["target"]): string | null`
  - `firstLine(body: string): string`
  - `type NotificationGroup = "today" | "yesterday" | "this_week" | "earlier"`; `GROUP_LABEL: Record<NotificationGroup, string>`
  - `dayGroup(iso: string, now: Date): NotificationGroup`
  - `groupByDay(items: AppNotification[], now: Date): { group: NotificationGroup; items: AppNotification[] }[]`

- [ ] **Step 1: Write the failing tests for the view helpers**

Create `packages/ui/tests/notification-view.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { AppNotification } from "../src/api";
import {
  dayGroup,
  firstLine,
  GROUP_LABEL,
  groupByDay,
  notificationAction,
  notificationType,
} from "../src/shell/notification-view";

// Local-time constructors keep these tests independent of the machine's time zone.
const now = new Date(2026, 9, 16, 15, 0);
const at = (d: Date) => d.toISOString();
const item = (id: string, when: Date): AppNotification => ({
  id,
  kind: "reputation.case_alert",
  subject: id,
  body: "x",
  createdAt: at(when),
  readAt: null,
  target: null,
});

describe("dayGroup", () => {
  test("groups by calendar day, not by 24-hour blocks", () => {
    expect(dayGroup(at(new Date(2026, 9, 16, 0, 5)), now)).toBe("today");
    expect(dayGroup(at(new Date(2026, 9, 15, 23, 59)), now)).toBe("yesterday");
    expect(dayGroup(at(new Date(2026, 9, 13, 12, 0)), now)).toBe("this_week");
    expect(dayGroup(at(new Date(2026, 9, 8, 12, 0)), now)).toBe("earlier");
  });

  test("a timestamp in the future counts as today", () => {
    expect(dayGroup(at(new Date(2026, 9, 17, 9, 0)), now)).toBe("today");
  });
});

describe("groupByDay", () => {
  test("keeps the order, orders the groups and omits empty ones", () => {
    const groups = groupByDay(
      [
        item("a", new Date(2026, 9, 16, 9, 0)),
        item("b", new Date(2026, 9, 16, 8, 0)),
        item("c", new Date(2026, 9, 10, 8, 0)),
      ],
      now,
    );
    expect(groups.map((g) => g.group)).toEqual(["today", "earlier"]);
    expect(groups[0]?.items.map((n) => n.id)).toEqual(["a", "b"]);
    expect(GROUP_LABEL.this_week).toBe("This week");
  });
});

describe("notificationType and notificationAction", () => {
  test("each kind has a type", () => {
    expect(notificationType("reputation.case_alert")).toBe("case");
    expect(notificationType("reputation.case_resolved")).toBe("case");
    expect(notificationType("core.location_requested")).toBe("place");
    expect(notificationType("core.location_decided")).toBe("place");
    expect(notificationType("reputation.help_message")).toBe("help");
    expect(notificationType("something.else")).toBe("other");
  });

  test("the action says what to do, and an old row with no target says to view the list", () => {
    const target = { type: "case", id: "c1" } as const;
    expect(notificationAction("reputation.case_alert", target)).toBe("Open case");
    expect(notificationAction("reputation.case_alert", null)).toBe("View list");
    expect(notificationAction("core.location_requested", { type: "location", id: "p" })).toBe(
      "Review place",
    );
    expect(notificationAction("core.location_decided", { type: "location", id: "p" })).toBe(
      "View place",
    );
    expect(notificationAction("reputation.help_message", { type: "help_request", id: "r" })).toBe(
      "Reply",
    );
    expect(notificationAction("something.else", null)).toBeNull();
  });
});

describe("firstLine", () => {
  test("takes the first line that has text", () => {
    expect(firstLine("\n  \nA survey opened a case.\nRating: 1 of 5.")).toBe(
      "A survey opened a case.",
    );
  });

  test("an empty body is an empty line, not a crash", () => {
    expect(firstLine("")).toBe("");
    expect(firstLine("   \n  ")).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/ui && bun test tests/notification-view.test.ts`
Expected: FAIL with `Cannot find module '../src/shell/notification-view'`.

- [ ] **Step 3: Write the helpers**

Create `packages/ui/src/shell/notification-view.ts`:

```ts
import type { AppNotification } from "../api";

export type NotificationType = "case" | "place" | "help" | "other";

export function notificationType(kind: string): NotificationType {
  switch (kind) {
    case "reputation.case_alert":
    case "reputation.case_resolved":
      return "case";
    case "core.location_requested":
    case "core.location_decided":
      return "place";
    case "reputation.help_message":
      return "help";
    default:
      return "other";
  }
}

/** What the person is expected to do. An older row with no target can only send them to the list. */
export function notificationAction(kind: string, target: AppNotification["target"]): string | null {
  const exact = (word: string) => (target ? word : "View list");
  switch (kind) {
    case "reputation.case_alert":
    case "reputation.case_resolved":
      return exact("Open case");
    case "core.location_requested":
      return exact("Review place");
    case "core.location_decided":
      return exact("View place");
    case "reputation.help_message":
      return exact("Reply");
    default:
      return null;
  }
}

/** The first line of the body that has text: the context a row shows under its subject. */
export function firstLine(body: string): string {
  return (
    body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

export type NotificationGroup = "today" | "yesterday" | "this_week" | "earlier";

export const GROUP_LABEL: Record<NotificationGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  earlier: "Earlier",
};

/** Calendar days in the viewer's time zone. A timestamp in the future counts as today. */
export function dayGroup(iso: string, now: Date): NotificationGroup {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "this_week";
  return "earlier";
}

const ORDER: NotificationGroup[] = ["today", "yesterday", "this_week", "earlier"];

/** The groups in time order, each keeping the order it came in, and none empty. */
export function groupByDay(
  items: AppNotification[],
  now: Date,
): { group: NotificationGroup; items: AppNotification[] }[] {
  return ORDER.map((group) => ({
    group,
    items: items.filter((n) => dayGroup(n.createdAt, now) === group),
  })).filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `cd packages/ui && bun test tests/notification-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component tests**

In `packages/ui/tests/notifications.test.tsx`, inside `describe("NotificationsMenu", ...)` add (the file's fixtures `items` and `make` already exist: `n1` is a location request with a target, unread; `n2` a case alert with a target, unread; `n3` a read location decision with no target):

```tsx
  test("each row says what to do, and an old one says to view the list", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="platform" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    // The action comes from the kind and the target, not from the surface: the case and the
    // location request carry a target; the old location decision has none.
    expect(await screen.findByText("Open case →")).toBeTruthy();
    expect(screen.getByText("Review place →")).toBeTruthy();
    expect(screen.getByText("View list →")).toBeTruthy();
  });

  test("rows are grouped under day headings", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    await screen.findByText(/A guest needs a reply at Bellaire/);
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThanOrEqual(1);
  });

  test("the context line is the first line of the body, and unread rows are marked in words", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    expect(await screen.findByText("Rating 1.")).toBeTruthy();
    // The words for unread rows are the sr-only spans; the "Unread" tab label is not one of them.
    expect(screen.getAllByText("Unread", { selector: "span.sr-only" }).length).toBe(2);
  });

  test("the Unread tab hides what was read", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    expect(await screen.findByText("Heights is now active")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /Unread/ }));
    expect(screen.queryByText("Heights is now active")).toBeNull();
    expect(screen.getByText(/A guest needs a reply at Bellaire/)).toBeTruthy();
  });

  test("marking everything read on the Unread tab leaves an explanation, not a blank panel", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    await user.click(await screen.findByRole("tab", { name: /Unread/ }));
    await user.click(screen.getByText("Mark all as read"));
    expect(await screen.findByText("No unread notifications.")).toBeTruthy();
  });

  test("Escape closes the panel and the unread count is announced politely", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("2 unread notifications"),
    );
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    expect(await screen.findByText("See all")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("See all")).toBeNull());
  });

  test("a notification with no subject, an empty body and a future time still renders one row", async () => {
    const client = make({
      notifications: async () => ({
        notifications: [
          {
            id: "odd",
            kind: "reputation.help_message",
            subject: null,
            body: "",
            createdAt: new Date(Date.now() + 3_600_000).toISOString(),
            readAt: null,
            target: null,
          },
        ],
        unread: 1,
      }),
    });
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 1 unread/));
    expect(await screen.findByText("reputation.help_message")).toBeTruthy();
    expect(screen.getByText("View list →")).toBeTruthy();
  });
```

- [ ] **Step 6: Run the component tests to verify they fail**

Run: `cd packages/ui && bun test tests/notifications.test.tsx`
Expected: FAIL on the six new tests; the older ones still pass.

- [ ] **Step 7: Rebuild the row and the menu**

In `packages/ui/src/shell/notifications.tsx`:

1. Replace the `lucide-react` import with `import { AlertTriangle, Bell, MapPin, MessageCircle } from "lucide-react";`, and add:

```tsx
import { Tabs } from "../navigation/tabs";
import {
  firstLine,
  GROUP_LABEL,
  groupByDay,
  notificationAction,
  notificationType,
  type NotificationType,
} from "./notification-view";
```

2. Replace the whole `Row` function with:

```tsx
const TYPE_ICON = { case: AlertTriangle, place: MapPin, help: MessageCircle, other: Bell } as const;
const TYPE_TINT: Record<NotificationType, string> = {
  case: "bg-status-danger-bg text-status-danger-fg",
  place: "bg-status-info-bg text-status-info-fg",
  help: "bg-status-warning-bg text-status-warning-fg",
  other: "bg-status-neutral-bg text-status-neutral-fg",
};

function Row({
  n,
  surface,
  linkAs: LinkAs = "a",
  onOpen,
  showBody,
}: {
  n: AppNotification;
  surface: Surface;
  linkAs?: ElementType;
  onOpen: (n: AppNotification) => void;
  showBody?: boolean;
}) {
  const unread = !n.readAt;
  const href = notificationHref(n.kind, surface, n.target);
  const type = notificationType(n.kind);
  const Icon = TYPE_ICON[type];
  const action = notificationAction(n.kind, n.target);
  const inner = (
    <span className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-control ${TYPE_TINT[type]}`}
      >
        <Icon size={16} strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`flex items-start gap-2 text-sm ${unread ? "font-medium text-fg-strong" : "text-fg-body"}`}
        >
          <span className="min-w-0 flex-1">{n.subject ?? n.kind}</span>
          {unread ? (
            <>
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-clay-500" />
              <span className="sr-only">Unread</span>
            </>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm text-fg-muted">
          {showBody ? n.body : firstLine(n.body)}
        </span>
        <span className="mt-1 flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>{ago(n.createdAt, new Date())}</span>
          {action ? <span className="font-medium text-fg-strong">{action} →</span> : null}
        </span>
      </span>
    </span>
  );
  const cls = `block w-full cursor-pointer text-left no-underline hover:bg-surface-sunken ${
    unread ? "bg-surface-page" : ""
  }`;
  return (
    <li>
      {href ? (
        <LinkAs href={href} onClick={() => onOpen(n)} className={`${cls} ${ROW_PAD}`}>
          {inner}
        </LinkAs>
      ) : (
        <button type="button" onClick={() => onOpen(n)} className={`${cls} ${ROW_PAD}`}>
          {inner}
        </button>
      )}
    </li>
  );
}
```

3. In `NotificationsMenu`, add state and derived values at the top of the function, replacing the existing `const recent = ...` line:

```tsx
  const [tab, setTab] = useState<"all" | "unread">("all");
  const shown = (data?.notifications ?? [])
    .filter((n) => tab === "all" || !n.readAt)
    .slice(0, 12);
  const groups = groupByDay(shown, new Date());
```

4. Replace the popover body (from the header `div` down to the closing of the list branch) with:

```tsx
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="m-0 text-base font-normal">Notifications</h2>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => markRead({ all: true })}
            className="cursor-pointer text-sm text-fg-muted underline underline-offset-4 hover:text-clay-600"
          >
            Mark all as read
          </button>
        ) : null}
      </div>
      <div className="border-b border-line px-4 py-2">
        <Tabs
          label="Filter notifications"
          value={tab}
          onValueChange={(v) => setTab(v as "all" | "unread")}
          items={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: unread },
          ]}
        />
      </div>
      {groups.length === 0 ? (
        <p className="m-0 px-4 py-8 text-center text-sm text-fg-muted">
          {tab === "unread" ? "No unread notifications." : "You are all caught up."}
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {groups.map((g) => (
            <section key={g.group}>
              <h3 className="label-caps m-0 bg-surface-sunken px-4 py-2 text-fg-muted">
                {GROUP_LABEL[g.group]}
              </h3>
              <ul className="m-0 list-none divide-y divide-line p-0">
                {g.items.map((n) => (
                  <Row
                    key={n.id}
                    n={n}
                    surface={surface}
                    linkAs={LinkAs}
                    onOpen={(x) => !x.readAt && markRead({ ids: [x.id] })}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
```

Keep the "See all" footer as it is.

5. Announce the count. The component currently returns the `<Popover ...>` element alone. Wrap it:

```tsx
  return (
    <>
      <span role="status" className="sr-only">
        {unread > 0 ? `${unread} unread notifications` : ""}
      </span>
      <Popover ...existing props and children...>
        ...
      </Popover>
    </>
  );
```

Keep every existing prop and child of `Popover` exactly as written in steps 3 and 4; only the wrapper and the status span are new. `Popover` is the Base UI popover (`feedback/overlays.tsx`): Escape closes it and focus returns to the trigger.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd packages/ui && bun test tests/notifications.test.tsx tests/notification-view.test.ts`
Expected: PASS. Two older assertions may need a text tweak because the subject is now inside nested spans: they use `getByText(regex)`, which still matches the inner span, and `.closest("a")`, which still finds the link. If `Notifications, 2 unread` tests fail on the sr-only "Unread" text being counted, change only that selector.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/shell packages/ui/tests/notification-view.test.ts packages/ui/tests/notifications.test.tsx
git commit -m "feat(ui): the bell groups by day, shows a type icon, a context line and the action"
```

---

### Task 8: The notifications page as a data page

**Files:**
- Modify: `packages/ui/src/shell/notifications.tsx` (`NotificationsPage`; imports)
- Test: `packages/ui/tests/notifications.test.tsx` (replace the `describe("NotificationsPage")` block)

**Interfaces:**
- Consumes: `FilterBar`, `DataTable`, `useTableState`, `applyTableState`, `TableSpec`, `RowSpec` (`../data`), `notificationType`, `notificationAction` (Task 7), `notificationHref`.
- Produces: `NotificationsPage` is a table of every notification with search, filters by type and read state, sort by time, paging, and a link per row.

- [ ] **Step 1: Write the failing tests**

In `packages/ui/tests/notifications.test.tsx`, replace the whole `describe("NotificationsPage", ...)` block with:

```tsx
describe("NotificationsPage", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  test("lists everything, read and unread, and can mark all as read", async () => {
    const client = make();
    const { user } = setup(<NotificationsPage surface="manager" client={client} />);
    expect(await screen.findByText("Heights is now active")).toBeTruthy();
    expect(screen.getByText(/A new location is waiting for approval/)).toBeTruthy();
    await user.click(screen.getByText("Mark all as read"));
    await waitFor(() => expect(client.markNotificationsRead).toHaveBeenCalledWith({ all: true }));
  });

  test("is a table whose first column links to what it is about", async () => {
    const client = make();
    setup(<NotificationsPage surface="manager" client={client} />);
    const link = await screen.findByRole("link", { name: /A guest needs a reply at Bellaire/ });
    expect(link.getAttribute("href")).toBe("/reputation/cases?case=case-9");
  });

  test("opening a row marks it read", async () => {
    const client = make();
    const { user } = setup(<NotificationsPage surface="manager" client={client} />);
    await user.click(await screen.findByRole("link", { name: /A guest needs a reply at Bellaire/ }));
    await waitFor(() => expect(client.markNotificationsRead).toHaveBeenCalledWith({ ids: ["n2"] }));
  });

  test("filters by what it is about, and the address remembers it", async () => {
    window.history.replaceState(null, "", "/?type=case");
    const client = make();
    setup(<NotificationsPage surface="manager" client={client} />);
    expect(await screen.findByText(/A guest needs a reply at Bellaire/)).toBeTruthy();
    expect(screen.queryByText("Heights is now active")).toBeNull();
    expect(screen.getByText("Type: Case")).toBeTruthy();
  });

  test("a filter that finds nothing says so and offers a way out", async () => {
    window.history.replaceState(null, "", "/?type=help");
    const client = make();
    const { user } = setup(<NotificationsPage surface="manager" client={client} />);
    expect(await screen.findByText("Nothing matches these filters")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Heights is now active")).toBeTruthy();
  });

  test("a stale filter value from an old link is the same empty state, not a crash", async () => {
    window.history.replaceState(null, "", "/?read=banana");
    const client = make();
    setup(<NotificationsPage surface="manager" client={client} />);
    expect(await screen.findByText("Nothing matches these filters")).toBeTruthy();
  });

  test("with no notifications at all it says nothing has happened yet", async () => {
    const client = make({ notifications: async () => ({ notifications: [], unread: 0 }) });
    setup(<NotificationsPage surface="manager" client={client} />);
    expect(await screen.findByText("Nothing yet")).toBeTruthy();
  });
});
```

Make sure the first line of the file imports `afterEach`: `import { afterEach, describe, expect, mock, test } from "bun:test";`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/ui && bun test tests/notifications.test.tsx -t "NotificationsPage"`
Expected: FAIL (no table, no filters).

- [ ] **Step 3: Rebuild the page**

In `packages/ui/src/shell/notifications.tsx`:

1. Add imports:

```tsx
import { applyTableState, type RowSpec, type TableSpec } from "../data/table-state";
import { useTableState } from "../data/use-table-state";
import { DataTable, type Column } from "../data/data-table";
import { FilterBar } from "../data/filter-bar";
```

2. Above `NotificationsPage`, add the table definitions:

```tsx
const PAGE_SPEC: TableSpec = {
  filterKeys: ["type", "read"],
  defaultSort: { key: "when", dir: "desc" },
};

const ROW_SPEC: RowSpec<AppNotification> = {
  searchText: (n) => `${n.subject ?? ""} ${n.body}`,
  filterValue: {
    type: (n) => notificationType(n.kind),
    read: (n) => (n.readAt ? "read" : "unread"),
  },
};

const TYPE_LABEL: Record<NotificationType, string> = {
  case: "Case",
  place: "Place",
  help: "Help request",
  other: "Other",
};
```

3. Replace the whole `NotificationsPage` function with:

```tsx
/** Everything that was sent to the person, as a table they can search and filter. */
export function NotificationsPage({
  surface,
  linkAs,
  client = api,
}: {
  surface: Surface;
  linkAs?: ElementType;
  client?: NotificationsClient;
}) {
  const { data, failed, load, markRead } = useNotifications(client);
  const table = useTableState(PAGE_SPEC);
  const all = data?.notifications ?? [];
  const shown = applyTableState(all, table.state, ROW_SPEC);

  const columns: Column<AppNotification>[] = [
    {
      key: "what",
      header: "Notification",
      sortValue: (n) => n.subject ?? n.kind,
      cell: (n) => (
        <span className={n.readAt ? "text-fg-body" : "font-medium text-fg-strong"}>
          {n.subject ?? n.kind}
          {n.readAt ? null : <span className="sr-only"> (unread)</span>}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (n) => TYPE_LABEL[notificationType(n.kind)],
      cell: (n) => TYPE_LABEL[notificationType(n.kind)],
    },
    {
      key: "action",
      header: "Action",
      cell: (n) => notificationAction(n.kind, n.target) ?? "",
    },
    {
      key: "when",
      header: "When",
      sortValue: (n) => new Date(n.createdAt).getTime(),
      cell: (n) => ago(n.createdAt, new Date()),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Notifications"
        description="What happened that needs you, and what was decided."
        actions={
          data && data.unread > 0 ? (
            <Button variant="outline" size="sm" onClick={() => markRead({ all: true })}>
              Mark all as read
            </Button>
          ) : null
        }
      />
      {failed ? <ErrorState title="Could not load notifications" onRetry={load} /> : null}
      {data === null && !failed ? <Skeleton className="h-24 w-full" /> : null}
      {data && all.length === 0 ? (
        <EmptyState title="Nothing yet">
          Case alerts and decisions about your places show up here.
        </EmptyState>
      ) : null}
      {data && all.length > 0 ? (
        <>
          <FilterBar
            search={{
              value: table.state.q,
              onChange: table.setSearch,
              placeholder: "Search notifications",
            }}
            filters={[
              {
                key: "type",
                label: "Type",
                options: (Object.keys(TYPE_LABEL) as NotificationType[]).map((value) => ({
                  value,
                  label: TYPE_LABEL[value],
                })),
                value: table.state.filters.type ?? null,
                onChange: (v) => table.setFilter("type", v),
              },
              {
                key: "read",
                label: "Read state",
                options: [
                  { value: "unread", label: "Unread" },
                  { value: "read", label: "Read" },
                ],
                value: table.state.filters.read ?? null,
                onChange: (v) => table.setFilter("read", v),
              },
            ]}
            shown={shown.length}
            total={all.length}
            onClear={table.clearFilters}
          />
          <DataTable
            label="Notifications"
            rows={shown}
            columns={columns}
            rowKey={(n) => n.id}
            rowHref={(n) => notificationHref(n.kind, surface, n.target)}
            onRowOpen={(n) => !n.readAt && markRead({ ids: [n.id] })}
            {...(linkAs ? { linkAs } : {})}
            sort={table.state.sort}
            onSortChange={table.setSort}
            page={table.state.page}
            onPageChange={table.setPage}
            empty={
              <EmptyState title="Nothing matches these filters">
                <Button variant="outline" size="sm" onClick={table.clearFilters}>
                  Clear filters
                </Button>
              </EmptyState>
            }
          />
        </>
      ) : null}
    </div>
  );
}
```

4. Remove the now-unused `ListPanel` import only if nothing else in the file uses it; `Row` and `ROW_PAD` are still used by the bell.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/ui && bun test tests/notifications.test.tsx`
Expected: PASS. Then from the repository root `bunx biome check --write packages/ui && bun run typecheck`: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): the notifications page is a data page with search, filters, paging and row links"
```

---

### Task 9: Documentation

**Files:**
- Create: `apps/docs/docs/guides/product-theme.md`, `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/guides/product-theme.md`
- Modify: `apps/docs/docs/guides/index.md`, `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/guides/index.md`, `docs/superpowers/specs/2026-10-16-ui-foundations-design.md` (one sentence)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write the English page**

Create `apps/docs/docs/guides/product-theme.md`:

````markdown
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
````

- [ ] **Step 2: Write the Spanish page**

Create `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/guides/product-theme.md`:

````markdown
---
sidebar_position: 3.5
title: "Tema del producto"
description: "Cómo se diferencia la interfaz del producto de la marca, y las reglas para pantallas de datos."
---

# Tema del *producto*

El Manager y la Platform usan la marca Atrium sobre una interfaz de papel y tarjetas pensada para datos densos. La marca (el sitio y el sistema de diseño de `atrium-docs`) no cambia. La capa del producto vive en `packages/ui/src/tokens-product.css` y se carga después de `tokens.css`, así que solo sobrescribe valores.

## Qué cambia el producto

| Token | Marca | Producto |
| --- | --- | --- |
| `--surface-page` | `#f4eee2` | `#f6f5f4` |
| `--surface-card` | `#fbf8f1` | `#ffffff` |
| `--surface-sunken` | `#e9e1d1` | `#f1efec` |
| `--border-light` | `#d4cab6` | `rgba(0, 0, 0, 0.08)` |
| Radio de tarjeta (`rounded-card`) | 6px | 12px |
| Radio de control (`rounded-control`) | 4px | 8px |

Las insignias de estado son píldoras con una palabra y una marca. Cada color de texto de estado sobre su fondo da al menos 4,5:1, y una prueba lo exige. Las tablas se enmarcan como tarjetas, sin regla de tinta arriba.

Sin cambios: lima, clay, charcoal, Inter Tight, la barra lateral oscura, el tema oscuro y el movimiento. El tema oscuro no se sobrescribe: la capa del producto se aplica a una raíz que no sea `data-atr-theme="dark"`.

## Reglas para las pantallas del producto

- Una sola acción primaria oscura por pantalla.
- Sin sombra en el contenido. La sombra es para popovers y menús.
- El blanco es una superficie de tarjeta, nunca el fondo de la página.
- Un estado nunca se indica solo con color.

## La página de datos

Una página de datos es una cabecera con como máximo una acción primaria, un `FilterBar` y un `DataTable`.

- `useTableState` guarda la búsqueda, los filtros, el orden y la página en la dirección (`?severity=high&sort=due:asc&page=2`). Se puede compartir un enlace y el botón atrás funciona. Se le pasa un `TableSpec` estable.
- `applyTableState` filtra en el navegador. La búsqueda es una coincidencia simple de texto.
- `DataTable` pagina de 25 en 25 filas, y la primera celda de una fila puede ser un enlace que cubre toda la fila.
- Un filtro que no encuentra nada es un estado vacío distinto de una tabla sin datos, y ofrece "Clear filters".

## La campana

La campana agrupa las notificaciones por día, muestra un icono según el tipo, una línea de contexto y la acción que se espera de la persona. Una notificación con destino abre ese caso, lugar o solicitud; una antigua abre la lista. "See all" abre una página de datos con filtros por tipo y estado de lectura.
````

- [ ] **Step 3: Index rows and the spec correction**

```bash
python3 -I - <<'EOF'
def sub(path, old, new):
    s = open(path).read()
    assert s.count(old) == 1, (path, old, s.count(old))
    open(path, "w").write(s.replace(old, new))

sub("apps/docs/docs/guides/index.md",
    "| [Conventions](./conventions) |",
    "| [Product theme](./product-theme) | How the product interface differs from the brand, and the rules for data screens |\n| [Conventions](./conventions) |")
sub("apps/docs/i18n/es/docusaurus-plugin-content-docs/current/guides/index.md",
    "| [Variables de entorno](./environment-variables) |",
    "| [Tema del producto](./product-theme) | Cómo se diferencia la interfaz del producto de la marca, y las reglas para pantallas de datos |\n| [Variables de entorno](./environment-variables) |")
sub("docs/superpowers/specs/2026-10-16-ui-foundations-design.md",
    'Docs: a "Product theme" page in the Design section, in English and Spanish,',
    'Docs: a "Product theme" page in the guides section (this repository has no Design section; that lives in `atrium-docs`), in English and Spanish,')
sub("docs/superpowers/specs/2026-10-16-ui-foundations-design.md",
    "Accessibility: the panel is a dialog with focus trapped and Escape to close; the unread count is announced in a live region;",
    "Accessibility: the panel is the Base UI popover (Escape closes it and focus returns to the bell); the unread count is announced in a polite live region;")
EOF
```

- [ ] **Step 4: Build the docs in both languages**

Run from the repository root: `bun run docs:build`
Expected: exit 0, `[SUCCESS] Generated static files` for `build` and `build/es`, no broken links.

- [ ] **Step 5: Commit**

```bash
git add apps/docs docs/superpowers/specs/2026-10-16-ui-foundations-design.md
git commit -m "docs(ui): the product theme and the data page, EN and ES"
```

---

### Task 10: Full verification and visual check

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the whole CI**

Run from the repository root: `bun run ci`
Expected: exit 0. If `apps/worker/tests/worker.test.ts` fails with `53300` (too many connections), stop the development servers first (`kill` the processes on ports 3001 to 3005) and rerun: that failure is the connection limit of the shared Postgres, not this change.

- [ ] **Step 2: Start the servers and sign in**

Start API, agents, worker, Manager, Platform and Hub as in `apps/docs/docs/guides/local-development.md` (`export AGENCY_SLUG=demo-atrium`, then each `bun --env-file=.env.local run --filter @atrium/<app> dev`). Sign in to Manager (`localhost:3002`) and Platform (`localhost:3003`) with the seed users listed in that guide.

- [ ] **Step 3: Check every screen in the browser**

For each screen below, in Manager and in Platform where it exists, take a screenshot and look for: a cream input on a white card, a radius that is out of step with its neighbours (6px next to 12px), a status that lost its word or mark, text that does not clear contrast, and anything that overflows at 1440px and at 390px width.

- Overview, Cases, Responses, Forms and QR, Help requests, Places (Manager); Overview, Reputation pages, My places, Help (Platform).
- The bell, open, with unread and read items; the Unread tab; "See all" (the notifications page with filters, search, sort and paging).
- A filter in the address (`/notifications?type=case`) and one with a bad value (`?read=banana`).

- [ ] **Step 4: Fix what the check finds**

For each problem: write a failing test when it is a class or a value the tests can see, fix it, run `cd packages/ui && bun test`, and commit with `fix(ui): <what>`. Visual-only problems are fixed and described in the commit message.

- [ ] **Step 5: Report**

Attach the screenshots and the list of screens reviewed to your report, say which problems were found and fixed, and say which were left, with the reason.
