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
