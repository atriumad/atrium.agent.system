import { afterEach, describe, expect, test } from "bun:test";
import type { AgencyOverview } from "../src/api";
import { MeProvider } from "../src/shell/me-context";
import { OverviewPage } from "../src/shell/overview";
import { amMe, fakeFetch, agencyInsightsFixture as fx, restoreFetch } from "./fake-api";
import { screen, setup, waitFor, within } from "./helpers";

/** Each text node on its own, so adjacent cells do not run into one another. */
const texts = (root: HTMLElement) => {
  const out: string[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n.textContent ?? "");
  return out;
};

afterEach(() => {
  restoreFetch();
  window.history.replaceState({}, "", "/");
});

const places = {
  locations: [
    { id: "p1", name: "Pier 4", clientId: "c2", clientName: "Blue Harbor Cafe", status: "active" },
    { id: "p2", name: "Dock", clientId: "c2", clientName: "Blue Harbor Cafe", status: "active" },
    { id: "p3", name: "Uptown", clientId: "c1", clientName: "Acme Dental", status: "active" },
  ],
};
const inside = () =>
  setup(
    <MeProvider me={amMe}>
      <OverviewPage surface="manager" />
    </MeProvider>,
  );
const routes = (data: AgencyOverview = fx) => ({
  "/api/locations": places,
  "/api/insights/agency?range=30d": data,
  "/api/insights/agency?range=7d": { ...data, range: "7d" },
  "/api/insights/agency?range=30d&client=c2": data,
});

describe("agency overview", () => {
  test("the queue comes first, overdue first, with a mark and a link to the item", async () => {
    fakeFetch(routes());
    inside();
    const table = await screen.findByRole("table", { name: "Needs a person now" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]?.textContent).toContain("Blue Harbor Cafe");
    expect(rows[1]?.textContent).toContain("Pier 4");
    expect(within(rows[1] as HTMLElement).getByText(/Overdue/)).toBeTruthy();
    const open = within(rows[1] as HTMLElement).getByRole("link", { name: /Open case/ });
    expect(open.getAttribute("href")).toBe("/reputation/cases/k1");
    expect(rows[1]?.textContent).toContain("Case");
    expect(rows[2]?.textContent).toContain("Approval");
    const wash = screen.getByRole("heading", { name: "Needs a person now" }).closest("section");
    expect(wash?.className).toContain("bg-lime-300");
  });

  test("the footer counts only what the queue does not show", async () => {
    fakeFetch(routes({ ...fx, queueCounts: { cases: 4, approvals: 1, accounts: 1, places: 1 } }));
    inside();
    const more = await screen.findByRole("link", { name: "3 more cases" });
    expect(more.getAttribute("href")).toBe("/reputation/cases");
    expect(screen.queryByText(/more approvals/)).toBeNull();
    expect(screen.queryByText(/more places/)).toBeNull();
    expect(screen.getByRole("link", { name: "1 more account" }).getAttribute("href")).toBe(
      "/approvals/accounts",
    );
  });

  test("twelve cases with eight rows shown says four more", async () => {
    const cases = Array.from({ length: 8 }, (_, i) => ({
      ...(fx.queue[0] as AgencyOverview["queue"][number]),
      id: `k${i}`,
      href: `/reputation/cases/k${i}`,
    }));
    fakeFetch(
      routes({
        ...fx,
        queue: cases,
        queueCounts: { cases: 12, approvals: 0, accounts: 0, places: 0 },
      }),
    );
    inside();
    expect(await screen.findByRole("link", { name: "4 more cases" })).toBeTruthy();
  });

  test("an empty queue says nothing needs a person", async () => {
    fakeFetch(
      routes({ ...fx, queue: [], queueCounts: { cases: 0, approvals: 0, accounts: 0, places: 0 } }),
    );
    inside();
    expect(await screen.findByText("Nothing needs a person right now")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Needs a person now" })).toBeNull();
  });

  test("the contact tile shows hours and minutes, the target and the share inside it", async () => {
    fakeFetch(routes());
    inside();
    const tile = (await screen.findByText("Median time to contact")).closest("a") as HTMLElement;
    expect(tile.textContent).toContain("6h 12m");
    expect(tile.textContent).toContain("Target 24h");
    expect(tile.textContent).toContain("94% inside target");
    expect(tile.textContent).toContain("1.5h faster");
  });

  test("the other tiles keep their units: overdue count, rating points, answer rate points", async () => {
    fakeFetch(routes());
    inside();
    const overdue = (await screen.findByText("Overdue cases")).closest("a") as HTMLElement;
    expect(overdue.textContent).toContain("2");
    expect(overdue.textContent).toContain("Was 3");
    const rating = screen.getByText("Portfolio rating").closest("a") as HTMLElement;
    expect(rating.textContent).toContain("4.2");
    expect(rating.textContent).toContain("0.1 pts");
    const rate = screen.getByText("Request → answer rate").closest("a") as HTMLElement;
    expect(rate.textContent).toContain("38%");
    expect(rate.textContent).toContain("4 pts");
    expect(rate.textContent).not.toContain("400");
    expect(rate.textContent).toContain("Sent 226 · answered 86");
  });

  test("a small portfolio rating says too few answers", async () => {
    fakeFetch(
      routes({
        ...fx,
        portfolio: { ...fx.portfolio, small: true, n: 7, change: null, value: null },
      }),
    );
    inside();
    const rating = (await screen.findByText("Portfolio rating")).closest("a") as HTMLElement;
    expect(within(rating).getByText("Too few answers (7)")).toBeTruthy();
  });

  test("a client without a rating shows too few answers, dashes and a word for its status", async () => {
    fakeFetch(routes());
    inside();
    const table = await screen.findByRole("table", { name: "Your clients" });
    const dune = within(table)
      .getAllByRole("row")
      .find((r) => r.textContent?.includes("Dune Motors")) as HTMLElement;
    const cells = within(dune).getAllByRole("cell");
    expect(cells[1]?.textContent).toBe("—");
    expect(cells[2]?.textContent).toContain("Too few answers");
    expect(cells[3]?.textContent).toBe("—");
    expect(within(dune).getByText("Healthy")).toBeTruthy();
    const acme = within(table)
      .getAllByRole("row")
      .find((r) => r.textContent?.includes("Acme Dental")) as HTMLElement;
    expect(within(acme).getByText("Needs a person")).toBeTruthy();
    expect(within(acme).getByRole("img", { name: /Acme Dental/ })).toBeTruthy();
    expect(acme.textContent).toContain("0.2 pts");
    expect(acme.textContent).toContain("42%");
  });

  test("a client with only pending places is setting up", async () => {
    fakeFetch(
      routes({
        ...fx,
        clients: [{ ...(fx.clients[3] as AgencyOverview["clients"][number]), pendingPlaces: 1 }],
      }),
    );
    inside();
    expect(await screen.findByText("Setting up")).toBeTruthy();
  });

  test("the range and the client refetch and write the address", async () => {
    const calls = fakeFetch(routes());
    const { user } = inside();
    await screen.findByText("Median time to contact");
    await user.click(screen.getByRole("radio", { name: "7D" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/insights/agency?range=7d")).toBe(true),
    );
    expect(window.location.search).toContain("range=7d");
    await user.click(screen.getByRole("radio", { name: "30D" }));
    await user.click(await screen.findByRole("combobox", { name: "Client" }));
    await user.click(await screen.findByRole("option", { name: "Blue Harbor Cafe" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/insights/agency?range=30d&client=c2")).toBe(true),
    );
    expect(window.location.search).toContain("client=c2");
  });

  test("a failed load shows a retry and no tile", async () => {
    fakeFetch({ "/api/locations": places });
    const { user } = inside();
    expect(await screen.findByText("Could not load the overview")).toBeTruthy();
    expect(screen.queryByText("Median time to contact")).toBeNull();
    fakeFetch(routes());
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Median time to contact")).toBeTruthy();
  });

  test("the stamp names the comparison", async () => {
    fakeFetch(routes());
    inside();
    expect(await screen.findByText(/compared with the previous 30 days/)).toBeTruthy();
  });
});

describe("agency overview numbers", () => {
  test("ugly floats are rounded everywhere", async () => {
    fakeFetch(
      routes({
        ...fx,
        contact: {
          ...fx.contact,
          medianHours: 6.2333333,
          change: -1.5432101,
          insideTarget: 0.9412345,
        },
        portfolio: { ...fx.portfolio, change: 0.2516505187344591, value: 4.2345678 },
        answerRate: { ...fx.answerRate, change: 3.035239646746124, value: 0.3812345 },
        clients: fx.clients.map((c) => ({
          ...c,
          change: c.change === null ? null : 0.731782945736434,
          rating: c.rating === null ? null : c.rating + 0.0123456789,
          answerRate: c.answerRate === null ? null : c.answerRate + 0.0123456789,
        })),
      }),
    );
    const { container } = inside();
    await screen.findByText("Median time to contact");
    expect(texts(container).filter((t) => /\d\.\d{3,}/.test(t))).toEqual([]);
    expect(container.textContent).toContain("0.3 pts");
    expect(container.textContent).toContain("1.5h faster");
  });

  test("a time change that rounds to nothing says no change", async () => {
    fakeFetch(routes({ ...fx, contact: { ...fx.contact, change: 0.04 } }));
    inside();
    const tile = (await screen.findByText("Median time to contact")).closest("a") as HTMLElement;
    expect(tile.textContent).toContain("no change");
    expect(tile.textContent).not.toContain("0h");
  });

  test("the contact figure is set in the brand serif", async () => {
    fakeFetch(routes());
    const { container } = inside();
    await screen.findByText("Median time to contact");
    expect(container.querySelector("span.font-serif")?.textContent).toBe("6h 12m");
  });
});

describe("agency overview empty tiles", () => {
  test("zero answers say No data yet, a few say Too few answers", async () => {
    fakeFetch(
      routes({
        ...fx,
        portfolio: { ...fx.portfolio, value: null, small: true, n: 0, change: null, spark: [] },
        answerRate: { ...fx.answerRate, value: null, small: true, sent: 5, change: null },
      }),
    );
    inside();
    const portfolio = (await screen.findByText("Portfolio rating")).closest("a") as HTMLElement;
    expect(within(portfolio).getByText("No data yet")).toBeTruthy();
    const rate = screen.getByText("Request → answer rate").closest("a") as HTMLElement;
    expect(within(rate).getByText("Too few answers (5)")).toBeTruthy();
  });
});
