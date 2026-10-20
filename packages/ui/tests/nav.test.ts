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

describe("loyalty entries", () => {
  const ownerLoyalty = meOf({
    kind: "client",
    role: "client_owner",
    canReadLoyalty: true,
    canStampLoyalty: true,
    canRedeemLoyalty: true,
    canManageLoyalty: true,
  });
  const retention = (me: Parameters<typeof platformNav>[0], level: "full" | "locked") =>
    platformNav(me, { ...levels, retention: level })
      .flatMap((g) => g.items)
      .find((i) => i.id === "retention");

  test("an owner with retention open gets Retention with Stamp a card, Loyalty activity and Program & QR", () => {
    const item = retention(ownerLoyalty, "full");
    expect(item?.href).toBe("/loyalty/stamp");
    expect(item?.locked).toBeFalsy();
    expect(item?.children).toEqual([
      { id: "loyalty-stamp", label: "Stamp a card", href: "/loyalty/stamp" },
      { id: "loyalty-activity", label: "Loyalty activity", href: "/loyalty/activity" },
      { id: "loyalty-program", label: "Program & QR", href: "/loyalty/program" },
    ]);
    const readOnly = retention(meOf({ kind: "client", canReadLoyalty: true }), "full");
    expect(readOnly?.href).toBe("/loyalty/activity");
    expect(readOnly?.children?.map((c) => c.id)).toEqual(["loyalty-activity", "loyalty-program"]);
    // without the permission the module stays the plain teaser link
    expect(retention(meOf({ kind: "client" }), "full")).toEqual({
      id: "retention",
      label: "Retention",
      href: "/modules/retention",
    });
  });

  test("retention locked keeps the locked Retention item and no loyalty children", () => {
    const item = retention(ownerLoyalty, "locked");
    expect(item).toEqual({
      id: "retention",
      label: "Retention",
      href: "/modules/retention",
      locked: true,
    });
  });

  test("the account manager gets Loyalty with Activity and Programs & QR", () => {
    const me = meOf({
      kind: "assigned",
      role: "account_manager",
      canReadLoyalty: true,
      canManageLoyalty: true,
    });
    const items = managerNav(me, { approvals: 0 }).flatMap((g) => g.items);
    const ids = items.map((i) => i.id);
    expect(ids.indexOf("loyalty")).toBe(ids.indexOf("reputation") + 1);
    const loyalty = items.find((i) => i.id === "loyalty");
    expect(loyalty).toMatchObject({ label: "Loyalty", href: "/loyalty/activity" });
    expect(loyalty?.children).toEqual([
      { id: "loyalty-activity", label: "Activity", href: "/loyalty/activity" },
      { id: "loyalty-program", label: "Programs & QR", href: "/loyalty/program" },
    ]);
    expect(
      managerNav(meOf({ kind: "assigned" }), { approvals: 0 }).flatMap((g) =>
        g.items.map((i) => i.id),
      ),
    ).not.toContain("loyalty");
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
