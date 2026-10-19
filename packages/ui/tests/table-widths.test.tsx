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
      const free = cols.filter((c) => !c.width).map((c) => c.key);
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
