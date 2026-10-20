import { afterEach, describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import type { LoyaltyActivityPage, LoyaltyActivityRow, LoyaltySummary } from "../src/api";
import { LoyaltyActivityPage as ActivityPage, LoyaltyBandView } from "../src/loyalty";
import { MeProvider } from "../src/shell/me-context";
import { amMe, meOf, restoreFetch } from "./fake-api";
import { screen, setup, waitFor, within } from "./helpers";

const BASE = "/api/loyalty/activity?range=30d";
const FIRST = `${BASE}&page=1&pageSize=25`;
const BAND = "/api/insights/loyalty?range=30d";
const places = {
  locations: [
    { id: "p1", name: "Casa Olivo", clientId: "c1", clientName: "Olivo" },
    { id: "p2", name: "Casa Uptown", clientId: "c1", clientName: "Olivo" },
  ],
};

type Body = unknown | Promise<unknown>;
type Reply = Body | (() => Body);
/** A fetch that answers by exact path. A function may throw an Error or return a `Response`-like status. */
function serve(routes: Record<string, Reply>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = typeof input === "string" ? input : input.toString();
    calls.push(path);
    const hit = routes[path];
    if (hit === undefined) return new Response("{}", { status: 404 });
    let body: unknown;
    try {
      body = await (typeof hit === "function" ? (hit as () => Body)() : hit);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      return new Response(JSON.stringify({ error: (e as Error).message }), { status });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}
const fail = (status: number, code: string) => () => {
  throw Object.assign(new Error(code), { status });
};

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).toISOString();
const rows: LoyaltyActivityRow[] = [
  {
    id: "e1",
    at: at(19, 14, 5),
    kind: "stamp",
    cardShortCode: "ABCD2345",
    locationId: "p1",
    locationName: "Casa Olivo",
    actorName: "Marta Staff",
    note: null,
  },
  {
    id: "e2",
    at: at(18, 9, 30),
    kind: "reward_earned",
    cardShortCode: "EFGH6789",
    locationId: "p1",
    locationName: "Casa Olivo",
    actorName: null,
    note: null,
  },
  {
    id: "e3",
    at: at(17, 8, 15),
    kind: "void",
    cardShortCode: "JKLM2345",
    locationId: "p2",
    locationName: "Casa Uptown",
    actorName: "Luis Staff",
    note: "Stamped the wrong card",
  },
];
const pageOf = (over: Partial<LoyaltyActivityPage> = {}): LoyaltyActivityPage => ({
  rows,
  total: 3,
  page: 1,
  pageSize: 25,
  ...over,
});
const many = (n: number, pageNo: number, total = 60): LoyaltyActivityPage => ({
  rows: Array.from({ length: n }, (_, i) => ({
    ...(rows[0] as LoyaltyActivityRow),
    id: `m${pageNo}-${i}`,
  })),
  total,
  page: pageNo,
  pageSize: 25,
});
const tile = (value: number, change: number | null = null, small = false) => ({
  value,
  change,
  small,
});
const band: LoyaltySummary = {
  cardsIssued: tile(48, 12),
  activeCards: tile(31),
  stamps: tile(212, -4),
  rewardsEarned: tile(9, null, true),
  rewardsRedeemed: tile(6, 25),
};

const base = (extra: Record<string, Reply> = {}) => ({
  "/api/locations": places,
  [FIRST]: pageOf(),
  [BAND]: band,
  ...extra,
});

const staff = meOf({ kind: "client", canReadLoyalty: true, canStampLoyalty: true });
const page = (me = staff) =>
  setup(
    <MeProvider me={me}>
      <ActivityPage />
    </MeProvider>,
  );

afterEach(() => {
  restoreFetch();
  window.history.replaceState({}, "", "/");
});

const tileOf = (label: string) =>
  within(screen.getByRole("region", { name: "Loyalty summary" })).getByText(label)
    .parentElement as HTMLElement;

describe("loyalty activity: the band", () => {
  test("the band shows the five figures and a change only where change is not null", async () => {
    serve(base());
    page();
    const region = await screen.findByRole("region", { name: "Loyalty summary" });
    await waitFor(() => expect(region.textContent).toContain("212"));
    expect(tileOf("Cards issued").textContent).toContain("48");
    expect(tileOf("Cards issued").textContent).toContain("12%");
    expect(tileOf("Active cards").textContent).toContain("31");
    expect(tileOf("Active cards").textContent).toContain("stamped in the range");
    expect(tileOf("Stamps").textContent).toContain("212");
    expect(tileOf("Stamps").textContent).toContain("4%");
    expect(tileOf("Rewards earned").textContent).toContain("9");
    // A null change shows no delta at all.
    expect(tileOf("Active cards").textContent).not.toMatch(/%|no change/);
    expect(tileOf("Rewards earned").textContent).not.toMatch(/%|no change/);
    // The aside: redeemed, with the earned total as the italic unit.
    const aside = within(region).getByText("Rewards redeemed").parentElement as HTMLElement;
    expect(aside.textContent).toContain("6");
    expect(aside.textContent).toContain("of 9 earned");
    expect(aside.textContent).not.toContain("25%");
    expect(region.textContent).not.toContain("NaN");
  });

  test("a small window carries the note, a large one does not", async () => {
    serve(base());
    page();
    await screen.findByRole("region", { name: "Loyalty summary" });
    await waitFor(() => expect(screen.getByText("Cards issued")).toBeTruthy());
    expect(tileOf("Rewards earned").textContent).toContain("change shows from 10 a window");
    expect(tileOf("Cards issued").textContent).not.toContain("change shows from 10 a window");
  });

  test("LoyaltyBandView draws a skeleton while loading and a retry on error", async () => {
    let retried = 0;
    const first = setup(<LoyaltyBandView band={null} state="loading" onRetry={() => {}} />);
    expect(screen.getByRole("status", { name: "Loading the summary" })).toBeTruthy();
    first.unmount();
    const { user } = setup(
      <LoyaltyBandView band={null} state="error" onRetry={() => (retried += 1)} />,
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retried).toBe(1);
  });

  test("a band failure shows its retry and leaves the table", async () => {
    let broken = true;
    const calls = serve(
      base({
        [BAND]: () => {
          if (broken) throw new Error("x");
          return band;
        },
      }),
    );
    const { user } = page();
    expect(await screen.findByText("Marta Staff")).toBeTruthy();
    expect(await screen.findByText("Could not load the summary")).toBeTruthy();
    broken = false;
    const before = calls.filter((c) => c === BAND).length;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(tileOf("Stamps").textContent).toContain("212"));
    expect(calls.filter((c) => c === BAND).length).toBeGreaterThan(before);
    expect(screen.getByText("Marta Staff")).toBeTruthy();
  });
});

describe("loyalty activity: the table", () => {
  test("rows show when, place, code, what and by; only a void shows its note", async () => {
    serve(base());
    page();
    const first = (await screen.findByText("ABCD2345")).closest("tr") as HTMLElement;
    expect(first.textContent).toContain("Oct 19, 14:05");
    expect(first.textContent).toContain("Casa Olivo");
    expect(within(first).getByText("ABCD2345").className).toContain("tabular-nums");
    expect(within(first).getByText("Stamp")).toBeTruthy();
    expect(within(first).getByText("Marta Staff")).toBeTruthy();
    expect(within(first).queryByText("Stamped the wrong card")).toBeNull();

    const earned = screen.getByText("EFGH6789").closest("tr") as HTMLElement;
    expect(within(earned).getByText("Reward earned")).toBeTruthy();
    expect(within(earned).getByText("System")).toBeTruthy();

    const voided = screen.getByText("JKLM2345").closest("tr") as HTMLElement;
    expect(within(voided).getByText("Void")).toBeTruthy();
    expect(within(voided).getByText("Casa Uptown")).toBeTruthy();
    expect(within(voided).getByText("Stamped the wrong card")).toBeTruthy();
    // Nothing but the note column carries a note.
    expect(screen.getAllByText("Stamped the wrong card")).toHaveLength(1);
  });

  test("the table is not sortable and says newest first", async () => {
    serve(base());
    page();
    await screen.findByText("ABCD2345");
    expect(screen.getByText(/newest first/)).toBeTruthy();
    for (const h of ["When", "Place", "Card", "What", "By", "Note"]) {
      expect(screen.getByRole("columnheader", { name: h })).toBeTruthy();
      expect(screen.queryByRole("button", { name: h })).toBeNull();
    }
  });

  test("the Voids tab requests kind=void and writes ?kind=void", async () => {
    const calls = serve(
      base({
        [`${BASE}&kind=void&page=1&pageSize=25`]: pageOf({ rows: rows.slice(2), total: 1 }),
      }),
    );
    const { user } = page();
    await screen.findByText("ABCD2345");
    expect(screen.getByRole("tab", { name: "All" })).toBeTruthy();
    for (const name of ["Stamps", "Rewards earned", "Redeemed", "Voids"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    await user.click(screen.getByRole("tab", { name: "Voids" }));
    await waitFor(() => expect(calls).toContain(`${BASE}&kind=void&page=1&pageSize=25`));
    expect(window.location.search).toContain("kind=void");
    expect(await screen.findByText(/Showing 1–1 of 1/)).toBeTruthy();
    expect(screen.queryByText("ABCD2345")).toBeNull();
  });

  test("the other tabs request their kind", async () => {
    const calls = serve(
      base({
        [`${BASE}&kind=stamp&page=1&pageSize=25`]: pageOf(),
        [`${BASE}&kind=reward_earned&page=1&pageSize=25`]: pageOf(),
        [`${BASE}&kind=reward_redeemed&page=1&pageSize=25`]: pageOf(),
      }),
    );
    const { user } = page();
    await screen.findByText("ABCD2345");
    await user.click(screen.getByRole("tab", { name: "Stamps" }));
    await waitFor(() => expect(calls).toContain(`${BASE}&kind=stamp&page=1&pageSize=25`));
    await user.click(screen.getByRole("tab", { name: "Rewards earned" }));
    await waitFor(() => expect(calls).toContain(`${BASE}&kind=reward_earned&page=1&pageSize=25`));
    await user.click(screen.getByRole("tab", { name: "Redeemed" }));
    await waitFor(() => expect(calls).toContain(`${BASE}&kind=reward_redeemed&page=1&pageSize=25`));
    await user.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => expect(window.location.search).not.toContain("kind="));
  });

  test("page 2 requests page=2&pageSize=25", async () => {
    const calls = serve(
      base({ [FIRST]: many(25, 1), [`${BASE}&page=2&pageSize=25`]: many(25, 2) }),
    );
    const { user } = page();
    await screen.findByText(/Showing 1–25 of 60/);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText(/Showing 26–50 of 60/)).toBeTruthy();
    expect(calls).toContain(`${BASE}&page=2&pageSize=25`);
    expect(window.location.search).toContain("page=2");
  });

  test("a page past the end asks for the last page once", async () => {
    window.history.replaceState({}, "", "/?page=9");
    const calls = serve(
      base({
        [`${BASE}&page=9&pageSize=25`]: { ...many(0, 9), rows: [] },
        [`${BASE}&page=3&pageSize=25`]: many(10, 3),
      }),
    );
    page();
    expect(await screen.findByText(/Showing 51–60 of 60/)).toBeTruthy();
    expect(calls.filter((c) => c.includes("page=3"))).toHaveLength(1);
    expect(screen.queryByText("No activity yet")).toBeNull();
  });

  test("a stale response never overwrites a newer one", async () => {
    let releaseOld: (v: unknown) => void = () => {};
    const old = new Promise((r) => {
      releaseOld = r;
    });
    serve(
      base({
        [FIRST]: () => old,
        [`${BASE}&kind=void&page=1&pageSize=25`]: pageOf({ rows: rows.slice(2), total: 1 }),
      }),
    );
    const { user } = page();
    await user.click(await screen.findByRole("tab", { name: "Voids" }));
    await screen.findByText(/Showing 1–1 of 1/);
    releaseOld(pageOf());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByText(/Showing 1–1 of 1/)).toBeTruthy();
    expect(screen.queryByText("ABCD2345")).toBeNull();
  });

  test("a table error shows its retry, which refetches", async () => {
    let broken = true;
    serve(
      base({
        [FIRST]: () => {
          if (broken) throw new Error("x");
          return pageOf();
        },
      }),
    );
    const { user } = page();
    expect(await screen.findByText("Could not load activity")).toBeTruthy();
    broken = false;
    const retry = screen.getAllByRole("button", { name: "Retry" })[0] as HTMLElement;
    await user.click(retry);
    expect(await screen.findByText("ABCD2345")).toBeTruthy();
  });

  test("empty states: no activity at all, and filters that found nothing with Clear filters", async () => {
    const empty = pageOf({ rows: [], total: 0 });
    serve(base({ [FIRST]: empty, [`${BASE}&kind=void&page=1&pageSize=25`]: empty }));
    const { user } = page();
    expect(await screen.findByText("No activity yet")).toBeTruthy();
    expect(screen.getByText("Stamps appear here as soon as the staff add them.")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Voids" }));
    expect(await screen.findByText("Your filters found nothing")).toBeTruthy();
    serve(base());
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("ABCD2345")).toBeTruthy();
    expect(window.location.search).not.toContain("kind=");
  });

  test("the title, description and a changed range back on page 1", async () => {
    window.history.replaceState({}, "", "/?page=2");
    const calls = serve(
      base({
        [`${BASE}&page=2&pageSize=25`]: many(25, 2),
        "/api/loyalty/activity?range=7d&page=1&pageSize=25": many(25, 1),
        "/api/insights/loyalty?range=7d": band,
      }),
    );
    const { user } = page();
    await screen.findByText(/Showing 26–50 of 60/);
    expect(screen.getByRole("heading", { name: "Loyalty activity" })).toBeTruthy();
    expect(screen.getByText("Stamps, rewards and voids on your cards.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "7D" }));
    expect(await screen.findByText(/Showing 1–25 of 60/)).toBeTruthy();
    expect(window.location.search).not.toContain("page=");
    expect(calls).toContain("/api/insights/loyalty?range=7d");
  });
});

describe("loyalty activity: access", () => {
  test("feature_locked from the band or the table shows the locked Retention page", async () => {
    const access = { "/api/access": { access: { retention: "locked" } } };
    serve(base({ ...access, [BAND]: fail(403, "feature_locked") }));
    const first = page();
    expect(await screen.findByText("Not in your plan yet.")).toBeTruthy();
    first.unmount();
    serve(base({ ...access, [FIRST]: fail(403, "feature_locked") }));
    page();
    expect(await screen.findByText("Not in your plan yet.")).toBeTruthy();
  });

  test("forbidden from either request, or no canReadLoyalty, shows Not available", async () => {
    serve(base({ [FIRST]: fail(403, "forbidden") }));
    const first = page();
    await waitFor(() => expect(screen.queryByText("ABCD2345")).toBeNull());
    expect(await screen.findByText(/not available/i)).toBeTruthy();
    first.unmount();
    serve(base());
    page(meOf({ kind: "client" }));
    expect(await screen.findByText(/not available/i)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Loyalty summary" })).toBeNull();
  });

  test("the agency sees the same page with every place in the selector", async () => {
    const calls = serve(
      base({
        [`${BASE}&place=p2&page=1&pageSize=25`]: pageOf({ rows: rows.slice(2), total: 1 }),
        "/api/insights/loyalty?range=30d&place=p2": band,
      }),
    );
    const { user } = page(meOf({ ...amMe, canReadLoyalty: true }));
    await screen.findByText("ABCD2345");
    await user.click(screen.getAllByRole("combobox", { name: "Place" })[0] as HTMLElement);
    expect(await screen.findByRole("option", { name: "Casa Olivo" })).toBeTruthy();
    await user.click(await screen.findByRole("option", { name: "Casa Uptown" }));
    await waitFor(() => expect(calls).toContain(`${BASE}&place=p2&page=1&pageSize=25`));
    expect(calls).toContain("/api/insights/loyalty?range=30d&place=p2");
    expect(await screen.findByText(/Showing 1–1 of 1/)).toBeTruthy();
  });

  test("no Stamp, Redeem or Void control anywhere on the page", async () => {
    serve(base());
    page(meOf({ ...staff, canRedeemLoyalty: true, canManageLoyalty: true }));
    await screen.findByText("ABCD2345");
    expect(screen.queryByRole("button", { name: /stamp|redeem|void/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /stamp|redeem|void/i })).toBeNull();
    // The words are there, as tabs and as cell text, not as controls.
    expect(screen.getByRole("tab", { name: "Voids" })).toBeTruthy();
    // No guest data: only the card code and the staff name.
    expect(document.body.textContent).not.toMatch(/@|\+\d{6,}/);
  });
});
