import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { Delta } from "../src/data/delta";
import { KpiTile } from "../src/data/kpi-tile";
import { PageControls, UpdatedStamp } from "../src/data/page-controls";
import { useRangeState } from "../src/data/use-range-state";
import { screen, setup } from "./helpers";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("useRangeState", () => {
  test("reads range and place from the address", () => {
    window.history.replaceState(null, "", "/?range=7d&place=p1");
    const { result } = renderHook(() => useRangeState({ scope: "place" }));
    expect(result.current.range).toBe("7d");
    expect(result.current.scopeId).toBe("p1");
  });

  test("an unknown range falls back to 30d", () => {
    window.history.replaceState(null, "", "/?range=bogus");
    const { result } = renderHook(() => useRangeState({ scope: "place" }));
    expect(result.current.range).toBe("30d");
    expect(result.current.scopeId).toBeNull();
  });

  test("setRange keeps the place and Back restores the previous range", () => {
    window.history.replaceState(null, "", "/?range=7d&place=p1");
    const { result } = renderHook(() => useRangeState({ scope: "place" }));
    act(() => result.current.setRange("90d"));
    expect(window.location.search).toContain("range=90d");
    expect(window.location.search).toContain("place=p1");
    expect(result.current.range).toBe("90d");
    act(() => {
      window.history.replaceState(null, "", "/?range=7d&place=p1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.range).toBe("7d");
  });

  test("the client scope reads and writes ?client= and keeps other params", () => {
    window.history.replaceState(null, "", "/?client=c1&x=1");
    const { result } = renderHook(() => useRangeState({ scope: "client" }));
    expect(result.current.scopeId).toBe("c1");
    act(() => result.current.setScopeId(null));
    expect(window.location.search).not.toContain("client=");
    expect(window.location.search).toContain("x=1");
  });
});

describe("PageControls", () => {
  const props = (over = {}) => ({
    range: "30d" as const,
    onRange: mock(),
    options: [{ value: "p1", label: "Place one" }],
    value: null,
    onValue: mock(),
    allLabel: "All places",
    scopeLabel: "Place",
    ...over,
  });

  test("a radiogroup of 7D, 30D, 90D with the current one checked", () => {
    setup(<PageControls {...props()} />);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["7D", "30D", "90D"]);
    expect(screen.getByRole("radio", { name: "30D" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "7D" }).getAttribute("aria-checked")).toBe("false");
  });

  test("clicking 7D reports it", async () => {
    const p = props();
    const { user } = setup(<PageControls {...p} />);
    await user.click(screen.getByRole("radio", { name: "7D" }));
    expect(p.onRange).toHaveBeenCalledWith("7d");
  });

  test("only the checked radio is a tab stop", () => {
    setup(<PageControls {...props()} />);
    const tabs = screen.getAllByRole("radio").map((r) => r.getAttribute("tabindex"));
    expect(tabs).toEqual(["-1", "0", "-1"]);
  });

  test("arrows move and select with wrap, Home and End jump", async () => {
    const p = props();
    const { user } = setup(<PageControls {...p} />);
    screen.getByRole("radio", { name: "30D" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(p.onRange).toHaveBeenLastCalledWith("90d");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "90D" }));
    await user.keyboard("{ArrowRight}");
    expect(p.onRange).toHaveBeenLastCalledWith("7d");
    await user.keyboard("{ArrowLeft}");
    expect(p.onRange).toHaveBeenLastCalledWith("90d");
    await user.keyboard("{ArrowDown}");
    expect(p.onRange).toHaveBeenLastCalledWith("7d");
    await user.keyboard("{ArrowUp}");
    expect(p.onRange).toHaveBeenLastCalledWith("90d");
    await user.keyboard("{Home}");
    expect(p.onRange).toHaveBeenLastCalledWith("7d");
    await user.keyboard("{End}");
    expect(p.onRange).toHaveBeenLastCalledWith("90d");
  });

  test("UpdatedStamp shows the time and the note", () => {
    setup(<UpdatedStamp at="2026-10-17T09:05:00Z" note="every 15 min" />);
    expect(screen.getByText(/^Updated .*\d.* · every 15 min$/)).toBeTruthy();
  });
});

describe("Delta unit", () => {
  test("pts renders points, direction words and clay when bad", () => {
    const { container } = setup(<Delta value={-3} goodWhen="up" unit="pts" />);
    expect(container.textContent).toContain("3 pts");
    expect(screen.getByText(/down/)).toBeTruthy();
    expect(container.firstElementChild?.className).toContain("text-clay-600");
  });

  test("the default stays percent", () => {
    const { container } = setup(<Delta value={4} />);
    expect(container.textContent).toContain("4%");
  });
});

describe("Delta formatting", () => {
  const text = (value: number, unit?: "%" | "pts") =>
    setup(<Delta value={value} {...(unit ? { unit } : {})} />).container.textContent;
  test("pts to one decimal, trailing .0 dropped", () => {
    expect(text(0.2516505187344591, "pts")).toContain("0.3 pts");
    expect(text(3.035239646746124, "pts")).toContain("3 pts");
    expect(text(0.731782945736434, "pts")).toContain("0.7 pts");
  });
  test("percent is whole from 10, one decimal under", () => {
    expect(text(1.834862385321101)).toContain("1.8%");
    expect(text(12.4)).toContain("12%");
  });
  test("a value that rounds to zero is no change", () => {
    for (const t of [text(0.04, "pts"), text(-0.04, "pts"), text(0.04)]) {
      expect(t).toContain("no change");
      expect(t).not.toMatch(/pts|%/);
    }
  });
});

describe("KpiTile", () => {
  test("tone lime carries the wash and not the card fill", () => {
    const { container } = setup(<KpiTile label="W" value="1" state="ok" tone="lime" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("bg-lime-300");
    expect(cls).not.toContain("bg-surface-card");
  });

  test("figureFont sans sets the sans face and shrinks the units", () => {
    const { container } = setup(<KpiTile label="T" value="11h 43m" state="ok" figureFont="sans" />);
    const fig = container.querySelector("span.font-sans.font-medium") as HTMLElement;
    expect(fig).toBeTruthy();
    expect(fig.textContent).toBe("11h 43m");
    expect(fig.className).not.toContain("font-serif");
    expect([...fig.querySelectorAll("span")].map((e) => e.textContent)).toEqual(["h", "m"]);
  });

  test("the default figure is serif", () => {
    const { container } = setup(<KpiTile label="T" value="4" state="ok" />);
    expect(container.querySelector("span.font-serif")).toBeTruthy();
  });

  test("too few answers replaces the delta and the trend", () => {
    const { container } = setup(
      <KpiTile
        label="Rating"
        value="4.1"
        delta={2}
        spark={[1, 2, 3]}
        sparkLabel="Rating trend"
        state={{ tooFew: 4 }}
      />,
    );
    expect(screen.getByText("Too few answers (4)")).toBeTruthy();
    expect(screen.queryByText(/up/)).toBeNull();
    expect(container.querySelector("svg[role='img']")).toBeNull();
  });

  test("none says there is no data yet", () => {
    setup(<KpiTile label="Rating" value="–" state="none" />);
    expect(screen.getByText("No data yet")).toBeTruthy();
  });

  test("with href the whole tile is a link named by label and value", () => {
    setup(<KpiTile label="Open cases" value="12" href="/cases" state="ok" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/cases");
    expect(link.textContent).toContain("Open cases");
    expect(link.textContent).toContain("12");
  });

  test("spark renders an image with its label, and the delta shows", () => {
    setup(
      <KpiTile
        label="Rating"
        value="4.1"
        delta={2}
        deltaUnit="pts"
        spark={[1, 2, 3]}
        sparkLabel="Rating over 30 days"
        state="ok"
      />,
    );
    expect(screen.getByRole("img", { name: "Rating over 30 days" })).toBeTruthy();
    expect(screen.getByText(/2 pts/)).toBeTruthy();
  });
});
