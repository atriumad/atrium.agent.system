import { describe, expect, test } from "bun:test";
import { casesColumns } from "../src/cases-columns";
import { DataTable } from "../src/data/data-table";
import { responsesColumns } from "../src/responses-columns";
import { casesTableFixture, responsesPageFixture } from "./fake-api";
import { screen, setup } from "./helpers";

type Row = { id: string; a: string; b: string };
const rows: Row[] = [{ id: "1", a: "x", b: "y" }];

describe("DataTable column widths", () => {
  test("a width goes to the colgroup and the table lays out fixed from lg", () => {
    const { container } = setup(
      <DataTable
        dense
        label="Rows"
        columns={[
          { key: "a", header: "A", cell: (r: Row) => r.a, width: "7rem" },
          { key: "b", header: "B", cell: (r: Row) => r.b },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        minWidth="50rem"
      />,
    );
    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(2);
    expect((cols[0] as HTMLElement).style.width).toBe("7rem");
    expect((cols[1] as HTMLElement).style.width).toBe("");
    const table = screen.getByRole("table", { name: "Rows" });
    expect(table.className).toContain("lg:table-fixed");
    expect(table.style.minWidth).toBe("50rem");
  });

  test("a selectable table keeps a narrow column for the checkbox", () => {
    const { container } = setup(
      <DataTable
        dense
        selectable
        label="Rows"
        columns={[{ key: "a", header: "A", cell: (r: Row) => r.a, width: "30%" }]}
        rows={rows}
        rowKey={(r) => r.id}
      />,
    );
    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(2);
    expect((cols[0] as HTMLElement).style.width).toBe("2.5rem");
    expect((cols[1] as HTMLElement).style.width).toBe("30%");
  });

  test("without any width there is no colgroup and the layout stays automatic", () => {
    const { container } = setup(
      <DataTable
        label="Rows"
        columns={[{ key: "a", header: "A", cell: (r: Row) => r.a }]}
        rows={rows}
        rowKey={(r) => r.id}
      />,
    );
    expect(container.querySelector("colgroup")).toBeNull();
    expect(screen.getByRole("table").className).not.toContain("table-fixed");
  });
});

describe("the Cases and Responses columns", () => {
  const now = new Date("2026-10-18T09:00:00.000Z");
  test("every column but the comment has a width, and the comment shares what is left", () => {
    for (const cols of [
      casesColumns({ showClient: true, now }),
      responsesColumns({ surface: "manager", showClient: true, now, backSearch: undefined }),
    ]) {
      const free = cols.filter((c) => !c.width && !c.colClassName).map((c) => c.key);
      expect(free).toEqual(["comment"]);
    }
  });

  test("a long client and place name truncates with the full name in the title", () => {
    const long = {
      ...(casesTableFixture.cases[0] as (typeof casesTableFixture.cases)[number]),
      clientName: "Harbor Dental Group of Northern Texas",
      locationName: "Downtown Plaza Tower, Floor 12",
    };
    const place = casesColumns({ showClient: true, now }).find((c) => c.key === "place");
    expect(place?.truncate).toBe(true);
    const { container } = setup(
      <DataTable
        dense
        label="Cases"
        columns={[place as NonNullable<typeof place>]}
        rows={[long]}
        rowKey={(r) => r.id}
      />,
    );
    const td = container.querySelector("tbody td") as HTMLElement;
    expect(td.className).toContain("truncate");
    expect(td.getAttribute("title")).toBe(
      "Harbor Dental Group of Northern Texas · Downtown Plaza Tower, Floor 12",
    );
  });

  test("the Responses place column truncates the same way", () => {
    const place = responsesColumns({
      surface: "manager",
      showClient: true,
      now,
      backSearch: undefined,
    }).find((c) => c.key === "place");
    expect(place?.truncate).toBe(true);
    const row = responsesPageFixture.rows[0] as (typeof responsesPageFixture.rows)[number];
    const { container } = setup(
      <DataTable
        dense
        label="Responses"
        columns={[place as NonNullable<typeof place>]}
        rows={[row]}
        rowKey={(r) => r.id}
      />,
    );
    const td = container.querySelector("tbody td") as HTMLElement;
    expect(td.className).toContain("truncate");
    expect(td.getAttribute("title")).toBe(`${row.clientName} · ${row.locationName}`);
  });
});

describe("round 2: Due, Status, balance", () => {
  const now = new Date("2026-10-18T09:00:00.000Z");
  const cases = casesColumns({ showClient: true, now });
  const resp = responsesColumns({
    surface: "manager",
    showClient: true,
    now,
    backSearch: undefined,
  });
  const classOf = (cols: { key: string }[], key: string) =>
    (cols.find((c) => c.key === key) as { colClassName?: string }).colClassName ?? "";

  test("Due truncates its text, keeps the pill from shrinking and carries the full text in the title", () => {
    const row = {
      ...(casesTableFixture.cases[0] as (typeof casesTableFixture.cases)[number]),
      status: "open" as const,
      dueAt: "2026-10-17T05:52:00.000Z",
    };
    const due = cases.find((c) => c.key === "due") as (typeof cases)[number];
    expect(due.truncate).toBe(true);
    expect(due.titleOf?.(row)).toContain("Overdue by");
    const { container } = setup(
      <DataTable dense label="Due" columns={[due]} rows={[row]} rowKey={(r) => r.id} />,
    );
    const td = container.querySelector("tbody td") as HTMLElement;
    expect(td.className).toContain("truncate");
    expect(td.getAttribute("title")).toContain("Overdue by");
    const wrap = td.firstElementChild as HTMLElement;
    expect(wrap.className).toContain("min-w-0");
    expect(wrap.firstElementChild?.className).toContain("shrink-0");
    expect(wrap.lastElementChild?.className).toContain("truncate");
  });

  test("Due and Status get more room at 2xl, and the status pill never exceeds its cell", () => {
    expect(classOf(cases, "due")).toContain("2xl:w-[13rem]");
    expect(classOf(cases, "status")).toContain("2xl:w-[10rem]");
    const row = casesTableFixture.cases[0] as (typeof casesTableFixture.cases)[number];
    const status = cases.find((c) => c.key === "status") as (typeof cases)[number];
    const { container } = setup(
      <DataTable
        dense
        label="S"
        columns={[status]}
        rows={[{ ...row, status: "contacted" }]}
        rowKey={(r) => r.id}
      />,
    );
    expect(container.querySelector("tbody td span")?.className).toContain("max-w-full");
  });

  test("Place and Topics widen at 2xl, in Cases and Responses", () => {
    for (const cols of [cases, resp]) {
      expect(classOf(cols, "place")).toContain("2xl:w-[22%]");
      expect(classOf(cols, "topics")).toContain("2xl:w-[13%]");
    }
    expect(resp.find((c) => c.key === "case")?.width).toBe("6.5rem");
  });
});
