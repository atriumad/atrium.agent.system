import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { CasesTablePage } from "../src/cases-table-page";
import { MeProvider } from "../src/shell/me-context";
import {
  amMe,
  casesBandFixture,
  casesTableFixture,
  fakeFetch,
  ownerMe,
  restoreFetch,
} from "./fake-api";
import { screen, setup, waitFor, within } from "./helpers";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const places = {
  locations: [
    {
      id: "p1",
      name: "Harbor Dental Downtown",
      clientId: "c1",
      clientName: "Harbor Dental",
      status: "active",
    },
    {
      id: "p2",
      name: "Harbor Dental Uptown",
      clientId: "c1",
      clientName: "Harbor Dental",
      status: "active",
    },
  ],
};
const placeTable = {
  cases: casesTableFixture.cases.slice(0, 1),
  counts: { active: 1, open: 1, contacted: 0, resolved: 4, all: 5 },
  truncated: false,
};
const routes = (table = casesTableFixture, band = casesBandFixture) => ({
  "/api/locations": places,
  "/api/cases?range=30d": table,
  "/api/cases?range=7d": table,
  "/api/cases?range=30d&place=p1": placeTable,
  "/api/insights/cases?range=30d&place=p1": casesBandFixture,
  "/api/insights/cases?range=30d": band,
  "/api/insights/cases?range=7d": { ...band, range: "7d" },
});
const page = (
  surface: "manager" | "platform" = "manager",
  me = amMe,
  replace?: (u: string) => void,
  linkAs?: React.ElementType,
) =>
  setup(
    <MeProvider me={me}>
      <CasesTablePage
        surface={surface}
        {...(replace ? { replace } : {})}
        {...(linkAs ? { linkAs } : {})}
      />
    </MeProvider>,
  );

beforeEach(() => setSystemTime(new Date("2026-10-18T09:00:00.000Z")));
afterEach(() => {
  setSystemTime();
  restoreFetch();
  window.history.replaceState({}, "", "/");
});

describe("cases table page", () => {
  test("band tiles show figures and units", async () => {
    fakeFetch(routes());
    page();
    const band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("6h 12m"));
    expect(band.textContent).toContain("6h 12m");
    expect(band.textContent).toContain("Target 24h");
    expect(band.textContent).toContain("94% inside target");
    expect(band.textContent).toContain("1 overdue");
    expect(band.textContent).toContain("Was 0 in the previous 30 days");
    expect(band.textContent).not.toContain("NaN");
  });

  test("tab counts come from the server, not the loaded rows", async () => {
    fakeFetch(routes());
    page();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Resolved/ }).textContent).toContain("11"),
    );
  });

  test("the overdue case sorts first and says overdue", async () => {
    fakeFetch(routes());
    page();
    const rows = await screen.findAllByRole("row");
    expect(rows[1]?.textContent).toContain("A tool was dropped");
    expect(rows[1]?.textContent).toContain("Overdue");
  });

  test("a tab and a filter update the address and the rows", async () => {
    fakeFetch(routes());
    const { user } = page();
    await screen.findByText(/A tool was dropped/);
    await user.click(screen.getByRole("tab", { name: /Resolved/ }));
    await waitFor(() => expect(window.location.search).toContain("tab=resolved"));
    expect(screen.queryByText(/A tool was dropped/)).toBeNull();
    await user.click(screen.getByRole("tab", { name: /^Active/ }));
    await user.click(screen.getByRole("combobox", { name: "Severity" }));
    await user.click(await screen.findByRole("option", { name: "Low" }));
    await waitFor(() => expect(window.location.search).toContain("severity=low"));
  });

  test("a row links to the case route with the table search as back", async () => {
    fakeFetch(routes());
    const { user } = page();
    await screen.findByText(/A tool was dropped/);
    await user.click(screen.getByRole("tab", { name: /^All/ }));
    await waitFor(() => {
      const link = document.querySelector("a[data-row-link]") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(
        `/reputation/cases/k3?back=${encodeURIComponent("?tab=all")}`,
      );
    });
  });

  test("the row link is named by severity, place and opening date, not by the severity word alone", async () => {
    fakeFetch(routes());
    page();
    await screen.findByText(/A tool was dropped/);
    const links = screen.getAllByRole("link", {
      name: /^High ?, case at Harbor Dental Downtown, opened [A-Z][a-z]{2} \d+$/,
    });
    expect(links.some((l) => l.getAttribute("href")?.includes("/reputation/cases/k1"))).toBe(true);
  });

  test("the row link uses the router's link when one is given", async () => {
    fakeFetch(routes());
    const Spy = ({ href, ...rest }: React.ComponentProps<"a">) => (
      <a href={href} data-spy="" {...rest} />
    );
    page("manager", amMe, undefined, Spy);
    await screen.findByText(/A tool was dropped/);
    const link = document.querySelector("a[data-row-link]") as HTMLAnchorElement;
    expect(link.hasAttribute("data-spy")).toBe(true);
  });

  test("an overdue row hides the relative text below xl but keeps it in the cell title", async () => {
    const overdue = {
      ...casesTableFixture,
      cases: [{ ...casesTableFixture.cases[0], dueAt: "2026-10-17T00:00:00.000Z" }],
    } as typeof casesTableFixture;
    fakeFetch(routes(overdue));
    page();
    const text = await screen.findByText(/^by /);
    expect(text.className).toContain("max-xl:hidden");
    expect(text.closest("td")?.getAttribute("title")).toMatch(/^Overdue by /);
  });

  test("the agency sees the place first in bold and the client after it, muted", async () => {
    fakeFetch(routes());
    page();
    await screen.findByText(/A tool was dropped/);
    const cell = screen.getAllByTitle("Harbor Dental Downtown · Harbor Dental")[0] as HTMLElement;
    const [place, client] = Array.from(
      (cell.firstElementChild as HTMLElement).children,
    ) as HTMLElement[];
    expect(place?.textContent).toBe("Harbor Dental Downtown");
    expect(place?.className).toContain("font-medium");
    expect(place?.className).toContain("truncate");
    expect(client?.textContent).toBe("Harbor Dental");
    expect(client?.className).toContain("text-fg-muted");
    expect(client?.className).toContain("truncate");
  });

  test("a small resolved count says too few cases, not answers", async () => {
    const small = {
      ...casesBandFixture,
      resolved: { value: 3, change: null, small: true },
    };
    fakeFetch(routes(casesTableFixture, small));
    page();
    const band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("Too few cases (3)"));
  });

  test("platform rows link to the feedback route and hide the client name", async () => {
    fakeFetch(routes());
    page("platform", ownerMe);
    await screen.findByText(/A tool was dropped/);
    const link = document.querySelector("a[data-row-link]") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/reputation/feedback/k3");
    expect(screen.queryByText(/Harbor Dental ·/)).toBeNull();
  });

  test("a truncated list says so", async () => {
    fakeFetch(routes({ ...casesTableFixture, truncated: true }));
    page();
    expect(await screen.findByText(/Showing the latest 200 cases/)).toBeTruthy();
  });

  test("an unread answer shows a dash in Topics", async () => {
    fakeFetch(routes());
    const { user } = page();
    await screen.findByText(/A tool was dropped/);
    await user.click(screen.getByRole("tab", { name: /^Resolved/ }));
    const row = (await screen.findAllByRole("row"))[1] as HTMLElement;
    expect(row.textContent).toContain("—");
  });

  test("changing the range refetches the band and the table", async () => {
    const calls = fakeFetch(routes());
    const { user } = page();
    await screen.findByText(/A tool was dropped/);
    await user.click(screen.getByRole("radio", { name: "7D" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/cases?range=7d")).toBe(true);
      expect(calls.some((c) => c.path === "/api/insights/cases?range=7d")).toBe(true);
    });
  });

  test("a band error keeps the table and Retry refetches only the band", async () => {
    let fail = true;
    const calls = fakeFetch({
      ...routes(),
      "/api/insights/cases?range=30d": () => {
        if (fail) throw new Error("x");
        return casesBandFixture;
      },
    });
    const { user } = page();
    expect(await screen.findByText(/A tool was dropped/)).toBeTruthy();
    const retry = await screen.findByRole("button", { name: "Retry" });
    const tableCalls = () => calls.filter((c) => c.path === "/api/cases?range=30d").length;
    const before = tableCalls();
    fail = false;
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry" })).toBeNull());
    expect(tableCalls()).toBe(before);
  });

  test("an old ?case= address redirects keeping the other parameters", async () => {
    window.history.replaceState({}, "", `/?case=${UUID}&range=7d`);
    const seen: string[] = [];
    fakeFetch(routes());
    page("manager", amMe, (u) => seen.push(u));
    await waitFor(() => expect(seen).toEqual([`/reputation/cases/${UUID}?range=7d`]));
  });

  test("empty states: nothing to follow up, and filters that found nothing", async () => {
    fakeFetch(
      routes({
        cases: [],
        counts: { active: 0, open: 0, contacted: 0, resolved: 0, all: 0 },
        truncated: false,
      }),
    );
    page();
    expect(await screen.findByText("Nothing needs follow-up right now.")).toBeTruthy();
  });

  test("filters that match nothing offer Clear filters", async () => {
    fakeFetch(routes());
    const { user } = page();
    await screen.findByText(/A tool was dropped/);
    await user.type(screen.getByRole("searchbox"), "zzzz");
    expect(await screen.findByText("Your filters found nothing")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText(/A tool was dropped/)).toBeTruthy();
  });

  test("choosing a place refetches with place= and shows that place's counts; Clear filters clears it", async () => {
    const calls = fakeFetch(routes());
    const { user } = page();
    await screen.findByText(/A tool was dropped/);
    await user.click(screen.getAllByRole("combobox", { name: "Place" })[0] as HTMLElement);
    await user.click(await screen.findByRole("option", { name: "Harbor Dental Downtown" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/cases?range=30d&place=p1")).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Resolved/ }).textContent).toContain("4"),
    );
    expect(screen.queryByText(/A tool was dropped/)).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(window.location.search).not.toContain("place="));
    expect(await screen.findByText(/A tool was dropped/)).toBeTruthy();
  });

  test("changing the range goes back to page 1", async () => {
    const many = {
      ...casesTableFixture,
      cases: Array.from({ length: 30 }, (_, i) => ({
        ...casesTableFixture.cases[0],
        id: `m${i}`,
      })),
    };
    fakeFetch(routes(many as never));
    window.history.replaceState({}, "", "/?page=2");
    const { user } = page();
    await screen.findByText("Page 2 of 2");
    await user.click(screen.getByRole("radio", { name: "7D" }));
    await waitFor(() => expect(window.location.search).not.toContain("page="));
    expect(window.location.search).toContain("range=7d");
    expect(await screen.findByText("Page 1 of 2")).toBeTruthy();
  });

  test("a range or place change on page 2 is ONE history entry", async () => {
    const many = {
      ...casesTableFixture,
      cases: Array.from({ length: 30 }, (_, i) => ({
        ...casesTableFixture.cases[0],
        id: `m${i}`,
      })),
    };
    fakeFetch(routes(many as never));
    window.history.replaceState({}, "", "/?page=2");
    const { user } = page();
    await screen.findByText("Page 2 of 2");
    let length = window.history.length;
    await user.click(screen.getByRole("radio", { name: "7D" }));
    await waitFor(() => expect(window.location.search).toContain("range=7d"));
    expect(window.location.search).not.toContain("page=");
    expect(window.history.length).toBe(length + 1);
    expect(await screen.findByText("Page 1 of 2")).toBeTruthy();

    window.history.replaceState({}, "", "/?page=2");
    await waitFor(() => window.dispatchEvent(new Event("popstate")));
    await screen.findByText("Page 2 of 2");
    length = window.history.length;
    await user.click(screen.getAllByRole("combobox", { name: "Place" })[0] as HTMLElement);
    await user.click(await screen.findByRole("option", { name: "Harbor Dental Downtown" }));
    await waitFor(() => expect(window.location.search).toContain("place=p1"));
    expect(window.location.search).not.toContain("page=");
    expect(window.history.length).toBe(length + 1);
  });

  test("a median that is too small to trust says too few, and none says no data", async () => {
    const small = {
      ...casesBandFixture,
      contact: { medianHours: 3, insideTarget: null, cases: 4, change: null, small: true },
    };
    fakeFetch(routes(casesTableFixture, small));
    page();
    const band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("Too few answers (4)"));
  });

  test("no median at all says no data yet", async () => {
    const none = {
      ...casesBandFixture,
      contact: { medianHours: null, insideTarget: null, cases: 0, change: null, small: false },
    };
    fakeFetch(routes(casesTableFixture, none));
    page();
    const band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("No data yet"));
  });

  test("a null median with cases behind it is none; a small one is too few; a good one is a figure", async () => {
    const noneWithCases = {
      ...casesBandFixture,
      contact: { medianHours: null, insideTarget: null, cases: 5, change: null, small: false },
    };
    fakeFetch(routes(casesTableFixture, noneWithCases));
    const first = page();
    let band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("No data yet"));
    expect(band.textContent).not.toContain("Too few answers (5)");
    first.unmount();
    restoreFetch();

    const small = {
      ...casesBandFixture,
      contact: { medianHours: 3, insideTarget: null, cases: 5, change: null, small: true },
    };
    fakeFetch(routes(casesTableFixture, small));
    const second = page();
    band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("Too few answers (5)"));
    second.unmount();
    restoreFetch();

    fakeFetch(routes());
    page();
    band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("6h 12m"));
    expect(band.textContent).not.toContain("Too few answers");
    expect(band.textContent).not.toContain("No data yet");
  });

  test("the table has column widths, lays out fixed from lg and scrolls under 52rem", async () => {
    fakeFetch(routes());
    const { container } = page();
    await screen.findByText(/A tool was dropped/);
    const table = screen.getByRole("table", { name: "Cases" });
    expect(table.className).toContain("lg:table-fixed");
    expect(table.style.minWidth).toBe("52rem");
    expect(container.querySelectorAll("colgroup col")).toHaveLength(8);
  });

  test("the band is four tiles in one row and an aside as their siblings", async () => {
    fakeFetch(routes());
    page();
    const band = await screen.findByRole("region", { name: "Cases summary" });
    await waitFor(() => expect(band.textContent).toContain("6h 12m"));
    const tiles = band.children[0] as HTMLElement;
    const aside = band.children[1] as HTMLElement;
    expect(band.children).toHaveLength(2);
    expect(tiles.className).toContain("grid-cols-2");
    expect(tiles.className).toContain("lg:grid-cols-4");
    expect(tiles.children).toHaveLength(4);
    expect(within(aside).getByText("Opened per day")).toBeTruthy();
    expect(within(aside).getByText("By severity")).toBeTruthy();
    expect(
      within(aside)
        .getByRole("img", { name: /Cases opened per day/ })
        .getAttribute("class"),
    ).toContain("absolute");
    // Under 2xl the aside sits below the tiles as two blocks side by side.
    expect(aside.className).toContain("lg:grid-cols-2");
    expect(aside.className).toContain("2xl:grid-cols-1");
  });
});
