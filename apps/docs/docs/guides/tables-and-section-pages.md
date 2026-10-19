---
sidebar_position: 3.7
title: "Tables and section pages"
description: "How a section page is laid out, the rules every table follows, and what the Cases and Responses pages show."
---

# Tables and *section pages*

Cases and Responses are section pages: a short summary on top and, under it, a conventional table with one row per case or per answer. Both apps use the same pages (the Manager and the Platform), and row-level security decides which rows a person sees. The pieces live in `@atrium/ui` (`DataSectionPage`, `DataTable`, `FilterBar`).

## The page

From top to bottom:

1. **Header.** The title and a line of description on the left; on the right the range (`7D`, `30D`, `90D`) and the **Place** select. The default is `30D` and all places.
2. **Summary band.** Four figures and, beside or under them, one chart or a ranked split. It has its own loading and its own error with a Retry button, so a slow band never holds the table.
3. **A note** saying that the filters apply to the table and the summary follows the range and place.
4. **Tabs**, with a count each (status on Cases, quick filters on Responses).
5. **Filter bar.** Search, selects, the active filters as chips, a count ("8 of 107") and "Clear all".
6. **The table**, framed like a card, with a footer ("Showing 1–25 of 107 · sorted by …") and the pager.

On screens from `lg` (1024px) the four figures sit in one row; below that they go two by two and the chart blocks stack. From `2xl` (1536px) the chart blocks take the right third of the band.

## The table rules

Every table follows the same rules, so a person learns one.

- **One line per row.** A long text is cut with an ellipsis and the full text shows on hover.
- **The first column is the link.** The whole row opens the detail; a link or button inside a row keeps working on its own.
- **Numbers are right-aligned** in tabular figures.
- **A state always has a word** next to its mark (`Overdue`, `Negative`, `Resolved`). Colour is never the only signal.
- **Dates** read `Oct 18, 9:40`, in the viewer's time zone, with how long ago on hover. A rating reads as stars (`★★☆☆☆`) and as "2 of 5" to a screen reader.
- **Sticky header** on large screens: the header stays in view while the rows scroll.
- **Small screens** scroll the table sideways and keep the first column pinned. The band stacks.
- **Nothing to show.** The table says either that there is no data yet, or that the filters found nothing, with a "Clear filters" button.

### Full width, and the columns that hide

The content uses the full width of the window. Below about **1536px** (`2xl`) the less important columns are hidden so the comment keeps room to read:

| Page | Column | Hidden below | Where the information is still available |
| --- | --- | --- | --- |
| Cases | Opened | 1280px (`xl`) | The case page says when it was opened |
| Cases | Topics | 1536px (`2xl`) | The `Topic (read answers)` filter still narrows the table |
| Responses | Topics | 1536px (`2xl`) | The row's drawer shows the reading and its topics |

## Range and place drive the band and the table

The range and the place at the top drive both the band and the table:

- The **range** sets the window: the last 7, 30 or 90 days. Days are each place's own local days, as in [Reading the Overview](./reading-the-overview#range-and-place).
- The **place** is applied on the server, for the rows and for the tab counts, so a page for one place is not the whole list narrowed in the browser. On Cases, the `Place` filter in the bar is the same control as the one in the header; Responses has no `Place` filter in the bar, only the header's.
- **Tabs, chips, search and column filters narrow only the table.** The band does not change while someone searches. Changing the range or the place goes back to page 1.

## Cases

The Cases page (`Recovery cases` in the Manager, `Guest feedback to follow up` in the Platform) lists the cases in the window: opened in it, or still open or contacted whenever they were opened.

**The band.** Four figures: `Active`, `Overdue`, `Median time to contact` and `Resolved`; then `Opened per day` and `By severity` (high, medium, low).

- `Active` counts the cases that are open plus those contacted, now. Its note says how many are overdue. It is the same number as the `Active` tab. The `Open` tab, in contrast, means open only: a contacted case is in `Active` and not in `Open`.
- `Overdue` is a "now" figure too, with the number of the previous window as a note.
- `Median time to contact` uses the Overview's definition, with the 24-hour target.
- `Resolved` counts the cases resolved in the window.

**Tabs.** `Active`, `Open`, `Contacted`, `Resolved` and `All`. Their counts come from the server for the whole window and place, so they stay right even with more than 200 cases. The table itself holds at most the latest 200 cases; when there are more, the footer says "Showing the latest 200 cases".

**Columns.**

| Column | What it shows |
| --- | --- |
| Severity | `High`, `Medium` or `Low`, as a pill |
| Rating | The guest's stars |
| Place | The place; the client and the place (`Client · Place`) for agency staff |
| What the guest said | The first 160 characters of the comment, cut to one line |
| Topics | Up to two topics and `+N`; a dash when the answer was not read yet |
| Due | When the case is due, or an `Overdue` pill with how long ago. The default sort, oldest first |
| Opened | When the case was opened |
| Status | `Open`, `Contacted` or `Resolved` |

**Filters.** Search, `Severity`, `Place`, `Topic (read answers)` and `Wants contact`. Search looks in the comment shown in the table, ignoring case. The filters work over the loaded cases. When some are not read yet, the footer says "N not read, so no topics".

**The row** opens the case page.

## Responses

The Responses page lists the answers in the window. Unlike Cases, it pages on the server: it is the one list that grows without bound, and each page asks for its own 25 rows.

**The band.** Four figures: `Responses`, `Average rating`, `Negative share` and `Review link clicks`; then `Rating distribution`, five bars (1 to 5 stars) with counts.

- `Negative share` is the share of the answers **that were read** and came out negative. Its note says "of N answers that were read". An answer with no reading is not counted as negative. It has its own small-sample rule: the change appears only with 10 or more answers read in both windows.
- `Review link clicks` counts clicks and shows their share of **all** the answers in the window.
- The rating, the small-sample rule and the units of change are those of [Reading the Overview](./reading-the-overview#the-small-sample-rule).

**Tabs.** `All`, `3 stars or fewer`, `Wants contact`, `Has a case` and `Safety`. The counts come from the server for the window and place; the other filters do not change them. `Safety` shows only the answers the reading flagged, and shows 0 when nothing is flagged or nothing has been read.

**Columns.**

| Column | What it shows |
| --- | --- |
| Date | When the guest answered. The default sort, newest first |
| Rating | The stars |
| Place | The place; `Client · Place` for agency staff |
| Comment | The comment, cut to one line; "No comment" when there is none |
| Sentiment | `Positive`, `Mixed` or `Negative`; a dash when the answer was not read |
| Topics | Up to two topics and `+N` |
| Contact | `Yes` when the guest asked to be contacted |
| Review | A check when the guest went to the review link |
| Case | `View case` when the answer opened a case |

Only `Date`, `Rating`, `Place` and `Sentiment` sort. They sort on the server, across all the pages.

**Filters.** Search, `Rating`, `Sentiment` and `Topic (read answers)`, plus the place in the header.

**The row** opens a drawer, not a page.

## The reading: sentiment and topics

Each answer that has been read carries one sentiment, a list of topics, a concern and a safety flag. The sentiment is `positive`, `mixed` or `negative`. The topics are food, service, wait, cleanliness, price, atmosphere, staff and other.

**Not read yet** means the answer has no reading: the Sentiment service has not read it, or is off. Its sentiment and topics show as a dash, and the drawer says "Not read yet". That is why the topic and sentiment filters are labelled `Topic (read answers)` and match read answers only. The footer says how many rows have no reading yet.

## Search

- On Responses, search looks in the comment, the best part and what to improve, ignoring case.
- The text is trimmed and cut to **200 characters**.
- The request goes out after a short pause (300 ms) from the last key, so typing does not send one request per letter. Emptying the box applies at once.
- `%` and `_` match themselves; they are not wildcards.

## The case page

A case opens on its own page: `/reputation/cases/<id>` in the Manager and `/reputation/feedback/<id>` in the Platform. It shows the answer, the contact details where allowed, the timeline and the actions.

`Back to cases` returns to the table as the person left it. The row's link carries the table's address in a `back` parameter (`?back=…`), with the filters, the sort, the range and the place. The bell's notifications open the same page.

An older `?case=<id>` link still works: it is read and redirected to the case page, keeping the other parameters.

## The response drawer

A row of Responses opens a drawer on the right, and the table stays where it is.

- It shows the full answer (comment, best part, what to improve), the reading (sentiment, concern, topics, safety flag), the guest's contact preference and whether they went to the review link.
- `Open case` appears when the answer has a case.
- `Ask for help about this` appears for owners, who can ask for help; it opens a help request about that answer.
- `Escape` closes the drawer. The address does not change, so a drawer is not a place to share.

## The address is the state

The range, the place, the tab, the filters, the search, the sort and the page live in the address (for example `?range=7d&place=<id>&tab=low&sort=rating:asc&page=2`). A filtered view can be shared, and the back button works. A place outside the person's scope finds nothing.

## What is not there

- **CSV export.** Guests' comments are third-party data; exporting them needs rules per role.
- **Bulk selection and bulk actions.**
- **A column chooser** and a density switch.
- **The QR or link source indicator** that the old Responses list showed.
- **Server paging for Cases.** The table holds the latest 200 and says so.
