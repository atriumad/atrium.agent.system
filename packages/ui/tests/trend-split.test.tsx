import { describe, expect, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { humaniseTopic, SplitBars } from "../src/data/split-bars";
import { TrendChart } from "../src/data/trend-chart";
import { screen } from "./helpers";

const points = [
  { date: "2026-09-19", average: 4.2, count: 1 },
  { date: "2026-09-20", average: null, count: 0 },
  { date: "2026-09-21", average: 3.8, count: 4 },
];

describe("TrendChart", () => {
  test("the img label states first and last average and the answers", () => {
    render(<TrendChart points={points} label="Rating per day" />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("4.2");
    expect(label).toContain("3.8");
    expect(label).toContain("5 answers");
  });

  test("hidden table has a row per point, a null average is an empty cell", () => {
    const { container } = render(<TrendChart points={points} label="Rating per day" />);
    const rows = within(container.querySelector("tbody") as HTMLElement).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getAllByRole("cell")[1]?.textContent).toBe("");
    expect(container.textContent).not.toContain("NaN");
  });

  test("fewer than 2 valid points shows the message and no svg", () => {
    const { container } = render(
      <TrendChart points={[points[0], points[1]] as typeof points} label="x" />,
    );
    expect(screen.getByText("Too few answers to draw a trend")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("SplitBars", () => {
  const row = { topic: "wait-time", total: 29, positive: 5, neutral: 3, negative: 21 };

  test("humanises a slug", () => {
    expect(humaniseTopic("wait-time")).toBe("Wait time");
    expect(humaniseTopic("food")).toBe("Food");
  });

  test("shows the percentage as text, the total, and widths summing to 100", () => {
    const { container } = render(<SplitBars rows={[row]} hint="h" empty="none" />);
    expect(screen.getByText("72% negative")).toBeTruthy();
    expect(screen.getByText("29")).toBeTruthy();
    const widths = [...container.querySelectorAll<HTMLElement>("[data-segment]")].map((e) =>
      Number.parseFloat(e.style.width),
    );
    expect(widths).toHaveLength(3);
    expect(Math.abs(widths.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.5);
  });

  test("href makes the row a link", () => {
    render(<SplitBars rows={[row]} hint="h" empty="none" href={(t) => `/x/${t}`} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/x/wait-time");
  });

  test("empty and zero-total rows", () => {
    const { rerender } = render(<SplitBars rows={[]} hint="h" empty="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    rerender(
      <SplitBars rows={[{ ...row, topic: "food", total: 0 }]} hint="h" empty="Nothing yet" />,
    );
    expect(screen.queryByText("Food")).toBeNull();
  });
});
