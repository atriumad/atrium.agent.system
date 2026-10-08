import { describe, expect, test } from "bun:test";
import { activeId, crumbsFor, managerNav, platformNav, teaserFor } from "../src/shell/nav";
import { meOf } from "./fake-api";

const flat = (groups: ReturnType<typeof managerNav>) =>
  groups.flatMap((g) => g.items.flatMap((i) => [i.id, ...(i.children?.map((c) => c.id) ?? [])]));

const adminMe = meOf({
  kind: "agency",
  role: "agency_admin",
  canReadSurveys: true,
  canViewForms: true,
  canManageLocations: true,
});

const levels = {
  reputation: "full",
  content: "full",
  analytics: "full",
  discoverability: "full",
  retention: "locked",
  attribution: "basic",
  growth: "full",
  management: "full",
  benchmarks: "locked",
} as const;

describe("manager menu", () => {
  test("an account manager sees the whole agency menu", () => {
    const me = meOf({
      kind: "assigned",
      role: "account_manager",
      canReadSurveys: true,
      canViewForms: true,
      canManageLocations: true,
    });
    expect(flat(managerNav(me, { approvals: 3 }))).toEqual([
      "overview",
      "reputation",
      "cases",
      "responses",
      "forms",
      "help-requests",
      "approvals",
      "approvals-accounts",
      "approvals-places",
      "clients",
      "clients-places",
    ]);
  });

  test("agency staff has no approvals", () => {
    const me = meOf({
      kind: "assigned",
      role: "agency_staff",
      canReadSurveys: true,
      canViewForms: true,
    });
    expect(flat(managerNav(me, { approvals: 0 }))).not.toContain("approvals");
  });

  test("the approvals count rides on the parent", () => {
    const item = managerNav(adminMe, { approvals: 4 })
      .flatMap((g) => g.items)
      .find((i) => i.id === "approvals");
    expect(item?.count).toBe(4);
  });
});

describe("platform menu", () => {
  test("an owner sees reputation, places, help and every module, locked ones marked", () => {
    const groups = platformNav(
      meOf({
        kind: "client",
        role: "client_owner",
        canReadSurveys: true,
        canViewForms: true,
        canRequestLocations: true,
        canRequestSurveys: true,
      }),
      levels,
    );
    expect(flat(groups).slice(0, 7)).toEqual([
      "overview",
      "reputation",
      "feedback",
      "responses",
      "qr",
      "places",
      "help",
    ]);
    const modules = groups.at(-1)?.items ?? [];
    expect(modules.map((m) => m.id)).toEqual([
      "content",
      "analytics",
      "discoverability",
      "retention",
      "attribution",
      "growth",
      "management",
      "benchmarks",
    ]);
    expect(modules.find((m) => m.id === "retention")?.locked).toBe(true);
    expect(modules.find((m) => m.id === "growth")?.locked).toBeFalsy();
    expect(modules.find((m) => m.id === "growth")?.href).toBe("/modules/growth");
  });

  test("a location manager sees feedback and responses only", () => {
    const ids = flat(
      platformNav(meOf({ kind: "client", role: "client_staff", canReadSurveys: true }), levels),
    );
    expect(ids).toContain("feedback");
    expect(ids).toContain("responses");
    for (const hidden of ["qr", "places", "help"]) expect(ids).not.toContain(hidden);
  });

  test("a locked reputation module is one locked item without children", () => {
    const rep = platformNav(
      meOf({
        kind: "client",
        role: "client_owner",
        canReadSurveys: true,
        canViewForms: true,
        canRequestLocations: true,
        canRequestSurveys: true,
      }),
      { ...levels, reputation: "locked" },
    )
      .flatMap((g) => g.items)
      .find((i) => i.id === "reputation");
    expect(rep?.locked).toBe(true);
    expect(rep?.children).toBeUndefined();
    expect(rep?.href).toBe("/modules/reputation");
  });
});

describe("the current item", () => {
  const groups = managerNav(adminMe, { approvals: 0 });
  test("is the longest matching route", () => {
    expect(activeId("/", groups)).toBe("overview");
    expect(activeId("/reputation/cases", groups)).toBe("cases");
    expect(activeId("/reputation/cases/abc", groups)).toBe("cases");
    expect(activeId("/approvals/places", groups)).toBe("approvals-places");
    expect(activeId("/nowhere", groups)).toBe("");
  });
});

describe("teasers", () => {
  test("are honest about what is locked and what is not built yet", () => {
    expect(teaserFor("retention", "locked")).toMatchObject({ locked: true });
    expect(teaserFor("analytics", "full")).toMatchObject({
      locked: false,
      title: expect.stringContaining("Analytics"),
    });
    expect(teaserFor("nonsense", "full")).toBeNull();
  });
});

describe("breadcrumbs", () => {
  const groups = managerNav(adminMe, { approvals: 0 });
  test("a child is shown under its parent, a top-level item alone", () => {
    expect(crumbsFor(groups, "responses")).toEqual([
      { label: "Reputation", href: "/reputation/cases" },
      { label: "Responses" },
    ]);
    expect(crumbsFor(groups, "overview")).toEqual([{ label: "Overview" }]);
    expect(crumbsFor(groups, "")).toEqual([]);
  });
});
