import { describe, expect, test } from "bun:test";
import { DailyBars } from "../src/data/daily-bars";
import { setup } from "./helpers";

const days = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 19 + i)).toISOString().slice(0, 10),
    count: i % 3,
  }));

describe("DailyBars", () => {
  test.each([7, 30, 90])("draws one bar per day for %d days and fills its width", (n) => {
    const { container } = setup(<DailyBars days={days(n)} label="Opened per day" />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.querySelectorAll("rect[data-day]").length).toBe(n);
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.getAttribute("viewBox")).toBeTruthy();
  });

  test("the text alternative lists every day with its total", () => {
    const { container } = setup(
      <DailyBars
        days={[
          { date: "2026-10-01", count: 2 },
          { date: "2026-10-02", count: 0 },
        ]}
        label="Opened per day"
      />,
    );
    const label = container.querySelector("svg")?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Opened per day");
    expect(label).toContain("2026-10-01 2");
    expect(label).toContain("2026-10-02 0");
  });

  test("no days draws nothing and no NaN", () => {
    const { container } = setup(<DailyBars days={[]} label="Opened per day" />);
    expect(container.innerHTML).not.toContain("NaN");
  });

  test("all zero days draws flat bars without NaN", () => {
    const { container } = setup(
      <DailyBars days={days(7).map((d) => ({ ...d, count: 0 }))} label="Opened per day" />,
    );
    expect(container.innerHTML).not.toContain("NaN");
  });
});
