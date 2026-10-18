import { describe, expect, mock, test } from "bun:test";
import {
  Accordion,
  Avatar,
  AvatarGroup,
  BarChart,
  Card,
  DataTable,
  Delta,
  DescriptionList,
  LineChart,
  Meter,
  Progress,
  ScoreRing,
  Skeleton,
  Sparkline,
  StatTile,
  TableWrap,
  Timeline,
} from "../src";
import { screen, setup, within } from "./helpers";

describe("Card", () => {
  test("default is a hairline, flat, 6px card", () => {
    setup(
      <Card title="Title" description="Line">
        Body
      </Card>,
    );
    const card = screen.getByText("Body");
    expect(card.className).toContain("border-frame");
    expect(card.className).toContain("rounded-card");
    expect(card.className).not.toMatch(/shadow-(card|raised|pop)/);
    expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
  });

  test("the emphasis card has an ink border and the printed offset", () => {
    setup(
      <Card tone="ruled" elevation="offset">
        X
      </Card>,
    );
    expect(screen.getByText("X").className).toContain("border-charcoal-800");
    expect(screen.getByText("X").className).toContain("shadow-raised");
  });
});

describe("Delta and StatTile", () => {
  test("down is good when fewer is better, and says so in words", () => {
    setup(<Delta value={-25} goodWhen="down" />);
    const el = screen.getByText(/25%/);
    expect(el.className).not.toContain("clay");
    expect(within(el).getByText("down")).toBeTruthy();
  });

  test("a change in the wrong direction is clay", () => {
    setup(<Delta value={-4} />);
    expect(screen.getByText(/4%/).className).toContain("clay-600");
  });

  test("StatTile sets the figure in the serif and names its trend", () => {
    setup(<StatTile label="New reviews" value="38" delta={12} trend={[1, 2, 3]} />);
    expect(screen.getByText("38").className).toContain("font-serif");
    expect(screen.getByRole("img", { name: "New reviews trend" })).toBeTruthy();
  });
});

describe("charts carry a text alternative", () => {
  test("bar chart lists every value", () => {
    setup(
      <BarChart
        label="Orders per week"
        data={[
          { label: "W1", value: 412 },
          { label: "W2", value: 438 },
        ]}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Orders per week: W1 412, W2 438",
    );
  });

  test("line chart names each series and ends", () => {
    setup(
      <LineChart
        label="Reviews"
        labels={["W1", "W2"]}
        series={[
          { name: "Google", values: [1, 2] },
          { name: "Yelp", values: [2, 1] },
        ]}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Google: 1, 2");
  });

  test("score ring reads as a score out of 100 and clamps", () => {
    setup(
      <>
        <ScoreRing value={72} label="Growth Score" />
        <ScoreRing value={150} label="Over" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Growth Score: 72 of 100" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Over: 100 of 100" })).toBeTruthy();
  });

  test("sparkline is labelled", () => {
    setup(<Sparkline values={[1, 3, 2]} label="Reviews trend" />);
    expect(screen.getByRole("img", { name: "Reviews trend" })).toBeTruthy();
  });
});

type Row = { id: string; name: string; reviews: number };
const rows: Row[] = [
  { id: "a", name: "Casa Olivo", reviews: 312 },
  { id: "b", name: "Brasa Norte", reviews: 198 },
  { id: "c", name: "La Mesa", reviews: 74 },
];
const columns = [
  { key: "name", header: "Location", cell: (r: Row) => r.name, sortValue: (r: Row) => r.name },
  {
    key: "reviews",
    header: "Reviews",
    cell: (r: Row) => r.reviews,
    numeric: true,
    sortValue: (r: Row) => r.reviews,
  },
];
const order = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.textContent);

describe("DataTable", () => {
  test("sorts by a header button and reports aria-sort", async () => {
    const { user } = setup(
      <DataTable label="Locations" rows={rows} columns={columns} rowKey={(r) => r.id} />,
    );
    await user.click(screen.getByRole("button", { name: "Reviews" }));
    expect(order()[0]).toContain("La Mesa");
    expect(screen.getByRole("columnheader", { name: "Reviews" }).getAttribute("aria-sort")).toBe(
      "ascending",
    );
    await user.click(screen.getByRole("button", { name: "Reviews" }));
    expect(order()[0]).toContain("Casa Olivo");
    expect(screen.getByRole("columnheader", { name: "Reviews" }).getAttribute("aria-sort")).toBe(
      "descending",
    );
  });

  test("right-aligns numbers", () => {
    setup(<DataTable label="L" rows={rows} columns={columns} rowKey={(r) => r.id} />);
    expect(screen.getByText("312").className).toContain("tabular-nums");
  });

  test("selects rows and all rows", async () => {
    const { user } = setup(
      <DataTable label="L" rows={rows} columns={columns} rowKey={(r) => r.id} selectable />,
    );
    await user.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]!);
    expect(screen.getAllByRole("row")[1]?.getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    expect(
      screen
        .getAllByRole("checkbox", { name: "Select row" })
        .every((c) => c.getAttribute("aria-checked") === "true"),
    ).toBe(true);
  });

  test("shows the empty state instead of an empty table, and marks loading busy", () => {
    const { rerender } = setup(
      <DataTable
        label="L"
        rows={[]}
        columns={columns}
        rowKey={(r: Row) => r.id}
        empty={<p>Nothing here.</p>}
      />,
    );
    expect(screen.getByText("Nothing here.")).toBeTruthy();
    rerender(
      <DataTable
        label="L"
        rows={[]}
        columns={columns}
        rowKey={(r: Row) => r.id}
        empty={<p>Nothing here.</p>}
        loading
      />,
    );
    expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
  });
});

describe("Avatar, Progress, Meter, Skeleton", () => {
  test("avatar shows initials and is named", () => {
    setup(<Avatar name="Dana Ruiz" />);
    expect(screen.getByRole("img", { name: "Dana Ruiz" }).textContent).toBe("DR");
  });

  test("avatar group collapses the rest into a count", () => {
    setup(<AvatarGroup max={2} people={[{ name: "A B" }, { name: "C D" }, { name: "E F" }]} />);
    expect(screen.getByText("+1")).toBeTruthy();
  });

  test("progress has a name and a value", () => {
    setup(<Progress label="Setup" value={72} showValue />);
    expect(screen.getByRole("progressbar", { name: "Setup" }).getAttribute("aria-valuenow")).toBe(
      "72",
    );
  });

  test("meter has a name", () => {
    setup(<Meter label="Budget used" value={20} />);
    expect(screen.getByRole("meter", { name: "Budget used" })).toBeTruthy();
  });

  test("skeleton is hidden from assistive technology", () => {
    const { container } = setup(<Skeleton />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Accordion, DescriptionList, Timeline", () => {
  test("accordion opens a panel from its trigger", async () => {
    const { user } = setup(
      <Accordion
        items={[{ value: "a", title: "How are cases ranked?", content: "By due date." }]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "How are cases ranked?" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  test("description list pairs terms with details", () => {
    setup(<DescriptionList items={[{ term: "Rating", detail: "1 of 5" }]} />);
    expect(screen.getByText("Rating").tagName).toBe("DT");
    expect(screen.getByText("1 of 5").tagName).toBe("DD");
  });

  test("timeline is an ordered list", () => {
    setup(
      <Timeline
        items={[
          { id: "1", title: "Case opened", time: "30h ago" },
          { id: "2", title: "Contacted", time: "3h ago" },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

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

  test("clicking another cell of the row opens it once", async () => {
    const onRowOpen = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 2)}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={(r) => `/places/${r.id}`}
        onRowOpen={onRowOpen}
      />,
    );
    // The link is a plain anchor here; stop jsdom-style navigation from mattering.
    await user.click(screen.getByText("1", { selector: "td" }));
    expect(onRowOpen).toHaveBeenCalledTimes(1);
    expect(onRowOpen).toHaveBeenCalledWith(many[0]);
  });

  test("clicking the link itself opens the row once, not twice", async () => {
    const onRowOpen = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 2)}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={(r) => `/places/${r.id}`}
        onRowOpen={onRowOpen}
      />,
    );
    await user.click(screen.getByRole("link", { name: "Place 1" }));
    expect(onRowOpen).toHaveBeenCalledTimes(1);
  });

  test("clicking a checkbox in a linked row does not open it", async () => {
    const onRowOpen = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 2)}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={(r) => `/places/${r.id}`}
        onRowOpen={onRowOpen}
        selectable
      />,
    );
    await user.click(screen.getAllByRole("checkbox", { name: "Select row" })[0] as HTMLElement);
    expect(onRowOpen).not.toHaveBeenCalled();
  });

  test("a row with no destination is not clickable", async () => {
    const onRowOpen = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 2)}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={() => null}
        onRowOpen={onRowOpen}
      />,
    );
    const row = screen.getAllByRole("row")[1] as HTMLElement;
    expect(row.className).not.toContain("cursor-pointer");
    await user.click(screen.getByText("1", { selector: "td" }));
    expect(onRowOpen).not.toHaveBeenCalled();
  });

  test("a row with a destination shows the pointer", () => {
    setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 2)}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={(r) => `/places/${r.id}`}
      />,
    );
    expect((screen.getAllByRole("row")[1] as HTMLElement).className).toContain("cursor-pointer");
  });

  test("a page size of zero still shows rows and a finite page count", () => {
    setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 3)}
        columns={cols}
        rowKey={(r) => r.id}
        pageSize={0}
      />,
    );
    expect(screen.getAllByRole("row").length).toBe(2);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
  });

  test("a framed table does not double its bottom line", () => {
    setup(<TableWrap data-testid="wrap">x</TableWrap>);
    expect(screen.getByTestId("wrap").className).toContain("[&_tr:last-child>td]:border-b-0");
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

  test("select all keeps what was chosen on other pages, and unchecking only removes this page", async () => {
    const onSelectedChange = mock();
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many}
        columns={cols}
        rowKey={(r) => r.id}
        pageSize={10}
        selectable
        selected={["p1"]}
        onSelectedChange={onSelectedChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    const page2 = many.slice(10, 20).map((r) => r.id);
    expect(onSelectedChange.mock.calls[0]?.[0]).toEqual(["p1", ...page2]);
  });

  test("unchecking select all on a fully selected page leaves other pages alone", async () => {
    const onSelectedChange = mock();
    const page2 = many.slice(10, 20).map((r) => r.id);
    const { user } = setup(
      <DataTable
        label="Places"
        rows={many}
        columns={cols}
        rowKey={(r) => r.id}
        pageSize={10}
        page={2}
        selectable
        selected={["p1", ...page2]}
        onSelectedChange={onSelectedChange}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    expect(onSelectedChange.mock.calls[0]?.[0]).toEqual(["p1"]);
  });

  test("the pinned cell follows the row's hover and selected state", () => {
    setup(
      <DataTable
        label="Places"
        rows={many.slice(0, 2)}
        columns={cols}
        rowKey={(r) => r.id}
        selectable
      />,
    );
    const cell = screen.getByRole("cell", { name: "Place 1" });
    expect(cell.className).toContain("max-md:group-hover:bg-surface-sunken");
    expect(cell.className).toContain("max-md:group-aria-selected:bg-lime-100");
    expect(cell.closest("tr")?.className).toContain("group");
    const th = screen.getByRole("columnheader", { name: "Name" });
    expect(th.className).not.toContain("group-");
  });
});

describe("DataTable dense rules", () => {
  type R = { id: string; name: string; n: number };
  const rows: R[] = [{ id: "a", name: "A very long place name", n: 5 }];
  const cols = [
    {
      key: "name",
      header: "Name",
      cell: (r: R) => r.name,
      truncate: true,
      sortValue: (r: R) => r.name,
    },
    {
      key: "txt",
      header: "Text",
      cell: (r: R) => <span>{r.name}</span>,
      truncate: true,
      titleOf: () => "The full text",
    },
    { key: "n", header: "N", cell: (r: R) => String(r.n), numeric: true, sortValue: (r: R) => r.n },
  ];

  test("dense has a sticky sunken header with an ink border and aria-sort", async () => {
    const { user } = setup(
      <DataTable dense label="T" rows={rows} columns={cols} rowKey={(r) => r.id} />,
    );
    const th = screen.getByRole("columnheader", { name: "Name" });
    expect(th.className).toContain("sticky");
    expect(th.className).toContain("bg-surface-sunken");
    expect(th.className).toContain("border-charcoal-800");
    await user.click(within(th).getByRole("button"));
    expect(th.getAttribute("aria-sort")).toBe("ascending");
  });

  test("a truncate cell is one line with the full text in its title", () => {
    setup(<DataTable dense label="T" rows={rows} columns={cols} rowKey={(r) => r.id} />);
    const plain = document.querySelector<HTMLElement>('td[title="A very long place name"]');
    expect(plain).toBeTruthy();
    expect(plain?.className).toContain("truncate");
    const custom = document.querySelector('td[title="The full text"]');
    expect(custom?.className).toContain("truncate");
  });

  test("numbers keep tabular figures and dense rows are 44px", () => {
    setup(<DataTable dense label="T" rows={rows} columns={cols} rowKey={(r) => r.id} />);
    const n = screen.getByRole("cell", { name: "5" });
    expect(n.className).toContain("tabular-nums");
    expect(n.className).toContain("h-11");
    expect(n.className).toContain("px-3");
  });

  test("a link and an inner button in a dense row: a row click opens only the link", async () => {
    const onRowOpen = mock();
    const onInner = mock();
    const { user } = setup(
      <DataTable
        dense
        label="T"
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
        onRowOpen={onRowOpen}
        columns={[
          { key: "name", header: "Name", cell: (r: R) => r.name },
          {
            key: "b",
            header: "B",
            cell: () => (
              <button type="button" onClick={onInner}>
                inner
              </button>
            ),
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "inner" }));
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onRowOpen).not.toHaveBeenCalled();
    await user.click(screen.getByRole("cell", { name: "inner" }));
    expect(onRowOpen).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable dense frame and footer", () => {
  type R = { id: string; name: string };
  const rows: R[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `Row ${i + 1}` }));
  const cols = [{ key: "name", header: "Name", cell: (r: R) => r.name }];

  test("the scroll area is bounded from lg and the header sticks with a solid background", () => {
    setup(<DataTable dense label="T" rows={rows} columns={cols} rowKey={(r) => r.id} />);
    const scroll = document.querySelector("[data-table-scroll]");
    expect(scroll?.className).toContain("overflow-auto");
    expect(scroll?.className).toContain("lg:max-h-[70vh]");
    const th = screen.getByRole("columnheader", { name: "Name" });
    expect(th.className).toContain("sticky");
    expect(th.className).toContain("top-0");
    expect(th.className).toContain("bg-surface-sunken");
  });

  test("footer text with and without a note", () => {
    const { unmount } = setup(
      <DataTable dense label="T" rows={rows} columns={cols} rowKey={(r) => r.id} />,
    );
    expect(document.querySelector("[data-table-footer]")?.textContent).toContain(
      "Showing 1–25 of 30",
    );
    expect(document.querySelector("[data-table-footer]")?.textContent).not.toContain("·");
    unmount();
    setup(
      <DataTable
        dense
        label="T"
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        footerNote="sorted by date"
      />,
    );
    expect(document.querySelector("[data-table-footer]")?.textContent).toContain(
      "Showing 1–25 of 30 · sorted by date",
    );
  });

  test("the pager lives in the footer, outside the scroll area, and pages", async () => {
    const { user } = setup(
      <DataTable dense label="T" rows={rows} columns={cols} rowKey={(r) => r.id} />,
    );
    const footer = document.querySelector("[data-table-footer]") as HTMLElement;
    const scroll = document.querySelector("[data-table-scroll]") as HTMLElement;
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(footer.contains(nav)).toBe(true);
    expect(scroll.contains(footer)).toBe(false);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(footer.textContent).toContain("Showing 26–30 of 30");
  });
});
