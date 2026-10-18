import { afterEach, describe, expect, test } from "bun:test";
import type { OwnerInsights } from "../src/api";
import { MeProvider } from "../src/shell/me-context";
import { OverviewPage } from "../src/shell/overview";
import { fakeFetch, ownerInsightsFixture, ownerMe, restoreFetch } from "./fake-api";
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
    { id: "p1", name: "Downtown", clientId: "c1", clientName: "Casa", status: "active" },
    { id: "p2", name: "Harbor", clientId: "c1", clientName: "Casa", status: "active" },
  ],
};
const inside = () =>
  setup(<MeProvider me={ownerMe}>{<OverviewPage surface="platform" />}</MeProvider>);
const routes = (data: OwnerInsights = ownerInsightsFixture) => ({
  "/api/locations": places,
  "/api/insights/owner?range=30d": data,
  "/api/insights/owner?range=7d": { ...data, range: "7d" },
  "/api/insights/owner?range=30d&place=p2": data,
});

describe("owner overview", () => {
  test("shows the four tiles with their figures and change", async () => {
    fakeFetch(routes());
    inside();
    const rating = (await screen.findByText("Average rating")).closest("a") as HTMLElement;
    expect(rating.textContent).toContain("4.3");
    expect(rating.textContent).toContain("0.2 pts");
    expect(rating.textContent).toContain("up");
    expect(screen.getByText("Responses").closest("a")?.textContent).toContain("12");
    expect(screen.getByText("Review link clicks").closest("a")?.textContent).toContain(
      "56% of answers clicked the review link",
    );
    expect(screen.getByText("Waiting on you")).toBeTruthy();
  });

  test("the review clicks change is shown in points as the server sends it", async () => {
    fakeFetch(routes());
    inside();
    const tile = (await screen.findByText("Review link clicks")).closest("a") as HTMLElement;
    expect(tile.textContent).toContain("8 pts");
    expect(tile.textContent).toContain("up");
  });

  test("a small rating says too few answers and draws no trend", async () => {
    fakeFetch(
      routes({
        ...ownerInsightsFixture,
        rating: { ...ownerInsightsFixture.rating, small: true, n: 9, change: null },
      }),
    );
    inside();
    const rating = (await screen.findByText("Average rating")).closest("a") as HTMLElement;
    expect(within(rating).getByText("Too few answers (9)")).toBeTruthy();
    expect(within(rating).queryByRole("img")).toBeNull();
  });

  test("a trend with too few days says so", async () => {
    fakeFetch(routes({ ...ownerInsightsFixture, series: [] }));
    inside();
    expect(await screen.findByText("Too few answers to draw a trend")).toBeTruthy();
  });

  test("with nothing read it says there is no reading yet", async () => {
    fakeFetch(routes({ ...ownerInsightsFixture, topics: [], read: 0 }));
    inside();
    expect(await screen.findByText("No reading yet for these answers")).toBeTruthy();
  });

  test("changing the range and the place refetches and writes the address", async () => {
    const calls = fakeFetch(routes());
    const { user } = inside();
    await screen.findByText("Average rating");
    await user.click(screen.getByRole("radio", { name: "7D" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/insights/owner?range=7d")).toBe(true),
    );
    expect(window.location.search).toContain("range=7d");
    await user.click(screen.getByRole("radio", { name: "30D" }));
    await user.click(await screen.findByRole("combobox", { name: "Place" }));
    await user.click(await screen.findByRole("option", { name: "Harbor" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/insights/owner?range=30d&place=p2")).toBe(true),
    );
    expect(window.location.search).toContain("place=p2");
  });

  test("the places table keeps the server order and shows a dash for no rating", async () => {
    fakeFetch(routes());
    inside();
    const table = await screen.findByRole("table", { name: "Your places" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]?.textContent).toContain("Downtown");
    const airport = rows.find((r) => r.textContent?.includes("Airport"));
    expect(airport?.textContent).toContain("—");
  });

  test("waiting on you links to overdue cases when some are overdue", async () => {
    fakeFetch(routes());
    inside();
    const tile = (await screen.findByText("Waiting on you")).closest("a") as HTMLElement;
    expect(tile.getAttribute("href")).toBe("/reputation/feedback?status=overdue");
    expect(tile.className).toContain("bg-lime-300");
  });

  test("waiting on you links to all cases when none are overdue", async () => {
    fakeFetch(routes({ ...ownerInsightsFixture, waiting: { open: 1, overdue: 0 } }));
    inside();
    const tile = (await screen.findByText("Waiting on you")).closest("a") as HTMLElement;
    expect(tile.getAttribute("href")).toBe("/reputation/feedback");
  });

  test("topic rows link to the answers for that topic", async () => {
    fakeFetch(routes());
    inside();
    const link = (await screen.findByText("Service")).closest("a") as HTMLElement;
    expect(link.getAttribute("href")).toBe("/reputation/responses?range=30d&topic=service");
  });

  test("What Host did is three lines of counts", async () => {
    fakeFetch(routes());
    inside();
    expect(await screen.findByText("Requests sent")).toBeTruthy();
    expect(screen.getByText("Cases opened")).toBeTruthy();
    expect(screen.getByText("Answers read")).toBeTruthy();
  });

  test("a failed load shows a retry and no tile", async () => {
    fakeFetch({ "/api/locations": places });
    const { user } = inside();
    expect(await screen.findByText("Could not load the overview")).toBeTruthy();
    expect(screen.queryByText("Average rating")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    fakeFetch(routes());
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Average rating")).toBeTruthy();
  });

  test("the stamp names the comparison", async () => {
    fakeFetch(routes());
    inside();
    expect(await screen.findByText(/compared with the previous 30 days/)).toBeTruthy();
  });
});

describe("owner overview numbers and wash", () => {
  test("ugly floats are rounded in tiles and the places table", async () => {
    const d = ownerInsightsFixture;
    fakeFetch(
      routes({
        ...d,
        rating: { ...d.rating, change: 0.2516505187344591, value: 4.3456789 },
        responses: { ...d.responses, change: 1.834862385321101, answerRate: 0.3333333 },
        reviewClicks: { ...d.reviewClicks, change: 3.035239646746124, rate: 0.5612345 },
        places: d.places.map((p) => ({
          ...p,
          change: p.change === null ? null : 0.731782945736434,
        })),
      }),
    );
    const { container } = inside();
    await screen.findByText("Average rating");
    expect(texts(container).filter((t) => /\d\.\d{3,}/.test(t))).toEqual([]);
    expect(container.textContent).toContain("0.3 pts");
    expect(container.textContent).toContain("1.8%");
    expect(container.textContent).toContain("0.7 pts");
  });

  test("Waiting on you is the only lime-washed tile", async () => {
    fakeFetch(routes());
    inside();
    const waiting = (await screen.findByText("Waiting on you")).closest("a") as HTMLElement;
    expect(waiting.className).toContain("bg-lime-300");
    for (const t of ["Average rating", "Responses", "Review link clicks"]) {
      expect((screen.getByText(t).closest("a") as HTMLElement).className).not.toContain("lime");
    }
  });
});

describe("owner overview empty tiles", () => {
  test("zero answers say No data yet; one to nine say Too few answers", async () => {
    const d = ownerInsightsFixture;
    fakeFetch(
      routes({
        ...d,
        rating: { ...d.rating, value: null, small: true, n: 0, change: null },
        responses: { ...d.responses, small: true, n: 4 },
      }),
    );
    inside();
    const rating = (await screen.findByText("Average rating")).closest("a") as HTMLElement;
    expect(within(rating).getByText("No data yet")).toBeTruthy();
    const responses = screen.getByText("Responses").closest("a") as HTMLElement;
    expect(within(responses).getByText("Too few answers (4)")).toBeTruthy();
  });
});
