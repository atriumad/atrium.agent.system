import { describe, expect, test } from "bun:test";
import { DataTable } from "../src/data/data-table";
import { screen, setup } from "./helpers";

type Row = { id: string; n: number };
const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, n: 26 + i }));
const columns = [{ key: "n", header: "N", cell: (r: Row) => r.n, sortValue: (r: Row) => r.n }];

describe("DataTable with server paging (totalRows)", () => {
  test("shows server totals and does not slice or sort the rows it is given", () => {
    setup(
      <DataTable
        dense
        label="Rows"
        columns={columns}
        rows={[...rows].reverse()}
        rowKey={(r) => r.id}
        totalRows={107}
        page={2}
        pageSize={25}
        sort={{ key: "n", dir: "asc" }}
      />,
    );
    expect(screen.getByText(/Showing 26–50 of 107/)).toBeTruthy();
    expect(screen.getByText("Page 2 of 5")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(26);
    // The order is the server's: the first row shown is the first row given.
    expect(screen.getAllByRole("row")[1]?.textContent).toBe("50");
  });

  test("Next asks for the next page", async () => {
    const asked: number[] = [];
    const { user } = setup(
      <DataTable
        dense
        label="Rows"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        totalRows={107}
        page={2}
        pageSize={25}
        onPageChange={(p) => asked.push(p)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(asked).toEqual([3]);
  });

  test("the last page counts only the rows it has", () => {
    setup(
      <DataTable
        dense
        label="Rows"
        columns={columns}
        rows={rows.slice(0, 7)}
        rowKey={(r) => r.id}
        totalRows={107}
        page={5}
        pageSize={25}
      />,
    );
    expect(screen.getByText(/Showing 101–107 of 107/)).toBeTruthy();
  });
});
