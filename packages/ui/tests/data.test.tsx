import { describe, expect, test } from "bun:test";
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
    expect(card.className).toContain("border-line");
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
