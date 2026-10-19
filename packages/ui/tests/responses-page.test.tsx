import { afterEach, describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import { RatingBars } from "../src/data/rating-bars";
import { ResponsesPage } from "../src/responses-page";
import { MeProvider } from "../src/shell/me-context";
import {
  amMe,
  ownerMe,
  responsesBandFixture,
  responsesPageFixture,
  restoreFetch,
} from "./fake-api";
import { fireEvent, screen, setup, waitFor, within } from "./helpers";

const BASE = "/api/surveys/responses?range=30d";
const FIRST = `${BASE}&page=1&pageSize=25&sort=date&dir=desc`;
const BAND = "/api/insights/responses?range=30d";
const places = {
  locations: [
    { id: "p1", name: "Harbor Dental Downtown", clientId: "c1", clientName: "Harbor Dental" },
    { id: "p2", name: "Harbor Dental Uptown", clientId: "c1", clientName: "Harbor Dental" },
  ],
};

type Body = unknown | Promise<unknown>;
/** A fetch that answers by exact path; a function may return a promise. Anything else is a 404. */
function serve(routes: Record<string, Body | (() => Body)>) {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = typeof input === "string" ? input : input.toString();
    calls.push(path);
    const hit = routes[path];
    if (hit === undefined) return new Response("{}", { status: 404 });
    const body = await (typeof hit === "function" ? (hit as () => Body)() : hit);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

const base = (extra: Record<string, Body | (() => Body)> = {}) => ({
  "/api/locations": places,
  [FIRST]: responsesPageFixture,
  [BAND]: responsesBandFixture,
  ...extra,
});
const page = (me = amMe) =>
  setup(
    <MeProvider me={me}>
      <ResponsesPage />
    </MeProvider>,
  );
const many = (n: number, pageNo: number, total = 107) => ({
  ...responsesPageFixture,
  page: pageNo,
  total,
  rows: Array.from({ length: n }, (_, i) => ({
    ...(responsesPageFixture.rows[0] as (typeof responsesPageFixture.rows)[number]),
    id: `m${pageNo}-${i}`,
  })),
});

afterEach(() => {
  restoreFetch();
  window.history.replaceState({}, "", "/");
});

describe("responses page: the table", () => {
  test("the first request carries the range, the first page and the default sort", async () => {
    const { calls } = serve(base());
    page();
    expect(await screen.findByText(/The room was cold/)).toBeTruthy();
    expect(calls).toContain(FIRST);
    expect(calls).toContain(BAND);
  });

  test("typing in search refetches with q= and goes back to page 1", async () => {
    window.history.replaceState({}, "", "/?page=2");
    const { calls } = serve(
      base({
        [`${BASE}&page=2&pageSize=25&sort=date&dir=desc`]: many(25, 2),
        [`${BASE}&page=1&pageSize=25&sort=date&dir=desc&q=cold`]: {
          ...responsesPageFixture,
          rows: responsesPageFixture.rows.slice(0, 1),
          total: 1,
        },
      }),
    );
    const { user } = page();
    await screen.findByText(/Showing 26–50 of 107/);
    await user.type(screen.getByRole("searchbox"), "cold");
    await waitFor(() => expect(calls.some((c) => c.endsWith("&q=cold"))).toBe(true));
    expect(window.location.search).toContain("q=cold");
    expect(window.location.search).not.toContain("page=");
    expect(await screen.findByText(/Showing 1–1 of 1/)).toBeTruthy();
  });

  test("the 3 stars or fewer tab sends maxRating=3, and tab counts come from the server", async () => {
    const { calls } = serve(base({ [`${FIRST}&maxRating=3`]: responsesPageFixture }));
    const { user } = page();
    await screen.findByText(/The room was cold/);
    expect(screen.getByRole("tab", { name: /3 stars or fewer/ }).textContent).toContain("31");
    expect(screen.getByRole("tab", { name: /Wants contact/ }).textContent).toContain("9");
    await user.click(screen.getByRole("tab", { name: /3 stars or fewer/ }));
    await waitFor(() => expect(calls.some((c) => c.includes("maxRating=3"))).toBe(true));
    expect(window.location.search).toContain("tab=low");
  });

  test("the other tabs send wantsContact, hasCase and safety", async () => {
    const { calls } = serve(
      base({
        [`${FIRST}&wantsContact=1`]: responsesPageFixture,
        [`${FIRST}&hasCase=1`]: responsesPageFixture,
        [`${FIRST}&safety=1`]: responsesPageFixture,
      }),
    );
    const { user } = page();
    await screen.findByText(/The room was cold/);
    await user.click(screen.getByRole("tab", { name: /Wants contact/ }));
    await waitFor(() => expect(calls.some((c) => c.endsWith("&wantsContact=1"))).toBe(true));
    await user.click(screen.getByRole("tab", { name: /Has a case/ }));
    await waitFor(() => expect(calls.some((c) => c.endsWith("&hasCase=1"))).toBe(true));
    await user.click(screen.getByRole("tab", { name: /Safety/ }));
    await waitFor(() => expect(calls.some((c) => c.endsWith("&safety=1"))).toBe(true));
  });

  test("filters send rating, sentiment and topic", async () => {
    const { calls } = serve(
      base({
        [`${FIRST}&rating=2`]: responsesPageFixture,
        [`${FIRST}&rating=2&sentiment=mixed`]: responsesPageFixture,
        [`${FIRST}&rating=2&sentiment=mixed&topic=wait`]: responsesPageFixture,
      }),
    );
    const { user } = page();
    await screen.findByText(/The room was cold/);
    await user.click(screen.getByRole("combobox", { name: "Rating" }));
    await user.click(await screen.findByRole("option", { name: "2 stars" }));
    await user.click(screen.getByRole("combobox", { name: "Sentiment" }));
    await user.click(await screen.findByRole("option", { name: "Mixed" }));
    await user.click(screen.getByRole("combobox", { name: "Topic (read answers)" }));
    await user.click(await screen.findByRole("option", { name: "Wait" }));
    await waitFor(() => expect(calls.some((c) => c.endsWith("&topic=wait"))).toBe(true));
    expect(screen.queryByRole("combobox", { name: "Place" })?.closest("form")).toBeNull();
  });

  test("sorting by Rating sends sort=rating&dir=asc", async () => {
    const { calls } = serve(
      base({ [`${BASE}&page=1&pageSize=25&sort=rating&dir=asc`]: responsesPageFixture }),
    );
    const { user } = page();
    await screen.findByText(/The room was cold/);
    await user.click(screen.getByRole("button", { name: "Rating" }));
    await waitFor(() => expect(calls.some((c) => c.includes("sort=rating&dir=asc"))).toBe(true));
    expect(screen.queryByRole("button", { name: "Comment" })).toBeNull();
    expect(screen.getByText(/sorted by rating/)).toBeTruthy();
  });

  test("the pager's page 2 sends page=2 and the footer reads Showing 26–50 of 107", async () => {
    const { calls } = serve(
      base({
        [FIRST]: many(25, 1),
        [`${BASE}&page=2&pageSize=25&sort=date&dir=desc`]: many(25, 2),
      }),
    );
    const { user } = page();
    await screen.findByText(/Showing 1–25 of 107/);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText(/Showing 26–50 of 107/)).toBeTruthy();
    expect(calls).toContain(`${BASE}&page=2&pageSize=25&sort=date&dir=desc`);
    expect(window.location.search).toContain("page=2");
  });

  test("an unread row shows dashes and the footer says how many have no reading", async () => {
    serve(base());
    page();
    await screen.findByText(/It was fine I suppose/);
    const row = screen.getByText(/It was fine I suppose/).closest("tr") as HTMLElement;
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/1 rows? (has|have) no reading yet/)).toBeTruthy();
    expect(screen.getByText(/sorted by date/)).toBeTruthy();
  });

  test("no unread rows, no footer note about them", async () => {
    serve(base({ [FIRST]: { ...responsesPageFixture, unread: 0 } }));
    page();
    await screen.findByText(/The room was cold/);
    expect(screen.queryByText(/no reading yet/)).toBeNull();
  });

  test("a client sees no client name; the agency sees client · place; rows link to the case", async () => {
    serve(base());
    const first = page(amMe);
    await screen.findByText(/The room was cold/);
    expect(screen.getAllByText("Harbor Dental · Harbor Dental Downtown").length).toBeGreaterThan(0);
    const link = screen.getAllByRole("link", { name: "View case" })[0] as HTMLAnchorElement;
    expect(link.getAttribute("href")?.startsWith("/reputation/cases/k1")).toBe(true);
    first.unmount();
    serve(base());
    page(ownerMe);
    await screen.findByText(/The room was cold/);
    expect(screen.queryByText(/Harbor Dental · /)).toBeNull();
    const own = screen.getAllByRole("link", { name: "View case" })[0] as HTMLAnchorElement;
    expect(own.getAttribute("href")?.startsWith("/reputation/feedback/k1")).toBe(true);
  });

  test("a stale response never overwrites a newer one", async () => {
    let releaseOld: (v: unknown) => void = () => {};
    const old = new Promise((r) => {
      releaseOld = r;
    });
    const { restore } = serve(
      base({
        [FIRST]: () => old,
        [`${FIRST}&maxRating=3`]: {
          ...responsesPageFixture,
          rows: responsesPageFixture.rows.slice(0, 1),
          total: 1,
        },
      }),
    );
    const { user } = page();
    await user.click(await screen.findByRole("tab", { name: /3 stars or fewer/ }));
    await screen.findByText(/Showing 1–1 of 1/);
    releaseOld(responsesPageFixture);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(/Showing 1–1 of 1/)).toBeTruthy();
    expect(screen.queryByText(/It was fine I suppose/)).toBeNull();
    restore();
  });

  test("while the next page loads the previous rows stay, marked busy", async () => {
    let release: (v: unknown) => void = () => {};
    const slow = new Promise((r) => {
      release = r;
    });
    serve(base({ [`${FIRST}&maxRating=3`]: () => slow }));
    const { user } = page();
    await screen.findByText(/The room was cold/);
    await user.click(screen.getByRole("tab", { name: /3 stars or fewer/ }));
    expect(screen.getByText(/The room was cold/)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull());
    await act(async () => {
      release(responsesPageFixture);
    });
    await screen.findByText(/It was fine I suppose/);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  test("a table error shows Could not load responses with Retry, which refetches", async () => {
    let fail = true;
    const { calls } = serve(
      base({
        [FIRST]: () => {
          if (fail) throw new Error("x");
          return responsesPageFixture;
        },
      }),
    );
    const { user } = page();
    expect(await screen.findByText("Could not load responses")).toBeTruthy();
    fail = false;
    const before = calls.filter((c) => c === FIRST).length;
    const retry = screen.getAllByRole("button", { name: "Retry" })[0] as HTMLElement;
    await user.click(retry);
    expect(await screen.findByText(/The room was cold/)).toBeTruthy();
    expect(calls.filter((c) => c === FIRST).length).toBeGreaterThan(before);
  });

  test("a band error does not hide the table", async () => {
    serve(
      base({
        [BAND]: () => {
          throw new Error("x");
        },
      }),
    );
    page();
    expect(await screen.findByText(/The room was cold/)).toBeTruthy();
    expect(await screen.findByText("Could not load the summary")).toBeTruthy();
  });

  test("empty states: no answers at all, and filters that found nothing with Clear filters", async () => {
    const empty = { ...responsesPageFixture, rows: [], total: 0, unread: 0 };
    serve(base({ [FIRST]: empty, [`${FIRST}&q=zzzz`]: empty }));
    const { user } = page();
    expect(await screen.findByText("No responses yet")).toBeTruthy();
    await user.type(screen.getByRole("searchbox"), "zzzz");
    expect(await screen.findByText("Your filters found nothing")).toBeTruthy();
    serve(base({ [FIRST]: responsesPageFixture }));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText(/The room was cold/)).toBeTruthy();
    expect(window.location.search).not.toContain("q=");
  });

  test("choosing a place refetches with place=, and Clear filters clears it in one step", async () => {
    const empty = { ...responsesPageFixture, rows: [], total: 0, unread: 0 };
    const { calls } = serve(
      base({
        [`${BASE}&place=p1&page=1&pageSize=25&sort=date&dir=desc`]: empty,
        "/api/insights/responses?range=30d&place=p1": responsesBandFixture,
      }),
    );
    const { user } = page();
    await screen.findByText(/The room was cold/);
    await user.click(screen.getAllByRole("combobox", { name: "Place" })[0] as HTMLElement);
    await user.click(await screen.findByRole("option", { name: "Harbor Dental Downtown" }));
    await waitFor(() => expect(calls.some((c) => c.includes("place=p1&page=1"))).toBe(true));
    expect(await screen.findByText("Your filters found nothing")).toBeTruthy();
    const length = window.history.length;
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(window.location.search).not.toContain("place="));
    expect(window.history.length).toBe(length + 1);
  });

  test("changing the range goes back to page 1 in one history entry", async () => {
    window.history.replaceState({}, "", "/?page=2");
    serve(
      base({
        [`${BASE}&page=2&pageSize=25&sort=date&dir=desc`]: many(25, 2),
        "/api/surveys/responses?range=7d&page=1&pageSize=25&sort=date&dir=desc": many(25, 1),
        "/api/insights/responses?range=7d": responsesBandFixture,
      }),
    );
    const { user } = page();
    await screen.findByText(/Showing 26–50 of 107/);
    const length = window.history.length;
    await user.click(screen.getByRole("radio", { name: "7D" }));
    await waitFor(() => expect(window.location.search).toContain("range=7d"));
    expect(window.location.search).not.toContain("page=");
    expect(window.history.length).toBe(length + 1);
    expect(await screen.findByText(/Showing 1–25 of 107/)).toBeTruthy();
  });
});

describe("responses page: the band", () => {
  test("tiles show figures, units and the notes", async () => {
    serve(base());
    page();
    const band = await screen.findByRole("region", { name: "Responses summary" });
    await waitFor(() => expect(band.textContent).toContain("107"));
    expect(band.textContent).toContain("Average rating");
    expect(band.textContent).toContain("4.2");
    expect(band.textContent).toContain("16");
    expect(band.textContent).toContain("of 106 answers that were read");
    expect(band.textContent).toContain("Review link clicks");
    expect(band.textContent).toContain("22");
    expect(band.textContent).toContain("21% of all 107 answers");
    expect(band.textContent).not.toContain("NaN");
  });

  test("a small negative share says Too few answers; none read says No data yet", async () => {
    serve(
      base({
        [BAND]: {
          ...responsesBandFixture,
          negativeShare: { value: 0.5, change: null, read: 4, small: true },
        },
      }),
    );
    const first = page();
    const band = await screen.findByRole("region", { name: "Responses summary" });
    await waitFor(() => expect(band.textContent).toContain("Too few answers"));
    first.unmount();
    serve(
      base({
        [BAND]: {
          ...responsesBandFixture,
          negativeShare: { value: null, change: null, read: 0, small: false },
        },
      }),
    );
    page();
    const again = await screen.findByRole("region", { name: "Responses summary" });
    await waitFor(() => expect(again.textContent).toContain("No data yet"));
    expect(again.textContent).not.toContain("NaN");
  });

  test("the distribution renders five bars with counts and a text alternative", async () => {
    serve(base());
    page();
    const chart = await screen.findByRole("img", { name: /Rating distribution/ });
    expect(chart.getAttribute("aria-label")).toContain("5 stars 45");
    expect(chart.getAttribute("aria-label")).toContain("1 star 6");
    expect(chart.querySelectorAll("[data-bar]")).toHaveLength(5);
    expect(chart.textContent).toContain("45");
  });
});

describe("RatingBars", () => {
  test("five bars, five stars first, widths relative to the largest", () => {
    const { container } = setup(
      <RatingBars counts={[6, 9, 16, 31, 45]} label="Rating distribution" />,
    );
    const bars = [...container.querySelectorAll<HTMLElement>("[data-bar]")];
    expect(bars.map((b) => b.dataset.bar)).toEqual(["5", "4", "3", "2", "1"]);
    expect(bars[0]?.style.width).toBe("100%");
    expect(bars[4]?.style.width).toBe(`${(6 / 45) * 100}%`);
  });

  test("all zeros draw no width and no NaN", () => {
    const { container } = setup(
      <RatingBars counts={[0, 0, 0, 0, 0]} label="Rating distribution" />,
    );
    expect(container.innerHTML).not.toContain("NaN");
    expect(container.querySelector<HTMLElement>("[data-bar]")?.style.width).toBe("0%");
  });
});

describe("responses page: the drawer", () => {
  test("a row opens the answer with the comment, the reading and the case; Escape closes it; the address is unchanged", async () => {
    serve(base());
    const { user } = page(ownerMe);
    await screen.findByText(/The room was cold/);
    const before = window.location.href;
    await user.click(screen.getByText(/The room was cold/));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The room was cold and nobody apologised.")).toBeTruthy();
    expect(within(dialog).getByText("Cold room, no apology")).toBeTruthy();
    expect(within(dialog).getByText("Negative")).toBeTruthy();
    expect(within(dialog).getByText(/Wants to be contacted/)).toBeTruthy();
    const open = within(dialog).getByRole("button", { name: "Open case" });
    expect(open.getAttribute("href")).toContain("/reputation/feedback/k1");
    const help = within(dialog).getByRole("button", { name: "Ask for help about this" });
    expect(help.getAttribute("href")).toBe("/help?response=r1&location=p1");
    expect(window.location.href).toBe(before);
    fireEvent.keyDown(dialog, { key: "Escape" });
    // The drawer leaves with an exit animation: give it a moment, then look.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.href).toBe(before);
    expect(document.activeElement?.closest("tr")?.textContent).toContain("The room was cold");
  });

  test("what to improve is in the drawer; agency roles get no help link", async () => {
    serve(base());
    const { user } = page(amMe);
    await screen.findByText(/The room was cold/);
    await user.click(screen.getAllByRole("row")[3] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Shorter forms at the desk.")).toBeTruthy();
    expect(within(dialog).getByText("Mixed")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Ask for help about this" })).toBeNull();
  });
});
