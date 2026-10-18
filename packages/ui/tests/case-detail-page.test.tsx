import { afterEach, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { CaseDetailPage, caseHref, listHref, redirectLegacyCase } from "../src/case-detail-page";
import { MeProvider } from "../src/shell/me-context";
import { amMe, fakeFetch, restoreFetch } from "./fake-api";
import { screen, setup } from "./helpers";

afterEach(() => {
  restoreFetch();
  window.history.replaceState({}, "", "/");
});

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const detail = (id: string) => ({
  id,
  clientId: "c1",
  clientName: "Casa Olivo",
  locationId: "l1",
  locationName: "Bellaire",
  severity: "high",
  status: "open",
  openedAt: hours(-2),
  dueAt: hours(20),
  rating: 1,
  wantsContact: true,
  contactedAt: null,
  resolvedAt: null,
  resolvedBy: null,
  note: null,
  response: { bestPart: null, improve: null, comment: "The soup was cold", createdAt: hours(-3) },
  contact: null,
});
const inside = (ui: ReactElement) => setup(<MeProvider me={amMe}>{ui}</MeProvider>);

describe("caseHref", () => {
  test("is the case route of each surface", () => {
    expect(caseHref("manager", "c1")).toBe("/reputation/cases/c1");
    expect(caseHref("platform", "c1")).toBe("/reputation/feedback/c1");
  });
  test("carries the list's query string as back, when given", () => {
    expect(caseHref("manager", "abc", "?range=7d&tab=open")).toBe(
      "/reputation/cases/abc?back=%3Frange%3D7d%26tab%3Dopen",
    );
    expect(caseHref("platform", "abc", "")).toBe("/reputation/feedback/abc");
  });
  test("encodes an id that is not path safe", () => {
    expect(caseHref("manager", "a/b c")).toBe("/reputation/cases/a%2Fb%20c");
  });
});

describe("listHref", () => {
  test("is the list path plus a safe query string", () => {
    expect(listHref("manager", "?range=7d&tab=open")).toBe("/reputation/cases?range=7d&tab=open");
    expect(listHref("platform", "?range=7d")).toBe("/reputation/feedback?range=7d");
  });
  test("ignores anything that is not a plain query string", () => {
    for (const bad of [
      null,
      "",
      "//evil.com",
      "https://x",
      "javascript:alert(1)",
      `?${"a".repeat(500)}`,
      "?a=1#frag",
      "?a=1\nb=2",
      "?a=\u0001",
    ]) {
      expect(listHref("manager", bad)).toBe("/reputation/cases");
    }
  });
});

describe("redirectLegacyCase", () => {
  const id = "0b9c1d52-3a4e-4f6a-8b7c-1234567890ab";
  test("only accepts an id that looks like a uuid", () => {
    expect(redirectLegacyCase("manager", `?case=${id}`)).toBe(`/reputation/cases/${id}`);
    expect(redirectLegacyCase("manager", "?case=../../x")).toBeNull();
    expect(redirectLegacyCase("manager", "?case=//evil.com")).toBeNull();
  });
  test("moves ?case= to the route and keeps the other parameters", () => {
    expect(redirectLegacyCase("manager", `?case=${id}&range=7d`)).toBe(
      `/reputation/cases/${id}?range=7d`,
    );
    expect(redirectLegacyCase("platform", `case=${id}`)).toBe(`/reputation/feedback/${id}`);
  });
  test("is null without a case parameter", () => {
    expect(redirectLegacyCase("manager", "?range=7d")).toBeNull();
    expect(redirectLegacyCase("manager", "")).toBeNull();
    expect(redirectLegacyCase("manager", "?case=")).toBeNull();
  });
});

describe("CaseDetailPage", () => {
  test("shows the case, a header and the way back to the list", async () => {
    fakeFetch({ "/api/cases/b": { case: detail("b") } });
    inside(<CaseDetailPage surface="manager" id="b" />);
    expect(await screen.findByText("The soup was cold")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Case" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to cases/ }).getAttribute("href")).toBe(
      "/reputation/cases",
    );
  });

  test("the back link returns to the list with the search it came from", async () => {
    window.history.replaceState({}, "", "/reputation/cases/abc?back=%3Frange%3D7d");
    fakeFetch({ "/api/cases/b": { case: detail("b") } });
    inside(<CaseDetailPage surface="manager" id="b" />);
    await screen.findByText("The soup was cold");
    expect(screen.getByRole("link", { name: /Back to cases/ }).getAttribute("href")).toBe(
      "/reputation/cases?range=7d",
    );
  });

  test("the not-found state is announced", async () => {
    fakeFetch({});
    inside(<CaseDetailPage surface="manager" id="nope" />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("That case does not exist or is not yours.");
  });

  test("the Platform goes back to its own list", async () => {
    fakeFetch({ "/api/cases/b": { case: detail("b") } });
    inside(<CaseDetailPage surface="platform" id="b" />);
    expect((await screen.findByRole("link", { name: /Back to cases/ })).getAttribute("href")).toBe(
      "/reputation/feedback",
    );
  });

  test("a 404 says the case does not exist or is not yours, with a link to the list", async () => {
    fakeFetch({});
    inside(<CaseDetailPage surface="manager" id="nope" />);
    expect(await screen.findByText("That case does not exist or is not yours.")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: /cases/i });
    expect(links.some((l) => l.getAttribute("href") === "/reputation/cases")).toBe(true);
  });

  test("any other failure shows an error with Retry, and Retry loads again", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1
        ? new Response("{}", { status: 500 })
        : new Response(JSON.stringify({ case: detail("b") }), { status: 200 });
    }) as unknown as typeof fetch;
    const { user } = inside(<CaseDetailPage surface="manager" id="b" />);
    expect(await screen.findByText("Could not load this case.")).toBeTruthy();
    expect(screen.queryByText("That case does not exist or is not yours.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("The soup was cold")).toBeTruthy();
  });
});
