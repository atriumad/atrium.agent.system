import { Building2, LayoutDashboard, LifeBuoy, MapPin, ShieldCheck, Star } from "lucide-react";
import { createElement } from "react";
import type { Me } from "../api";
import { Icon } from "../icon";
import type { SideNavGroup, SideNavItem } from "../navigation/shell";

export type Level = "full" | "basic" | "locked";
export type Module =
  | "content"
  | "analytics"
  | "discoverability"
  | "retention"
  | "attribution"
  | "growth"
  | "management"
  | "benchmarks";
export type Access = Partial<Record<Module | "reputation", Level>>;

/** The client's modules in menu order. Reputation is its own menu entry, with children. */
export const MODULES: readonly { feature: Module; label: string }[] = [
  { feature: "content", label: "Content" },
  { feature: "analytics", label: "Analytics" },
  { feature: "discoverability", label: "Discoverability" },
  { feature: "retention", label: "Retention" },
  { feature: "attribution", label: "Attribution" },
  { feature: "growth", label: "Growth" },
  { feature: "management", label: "Management" },
  { feature: "benchmarks", label: "Benchmarks" },
];

const icon = (glyph: Parameters<typeof Icon>[0]["icon"]) =>
  createElement(Icon, { icon: glyph, size: "sm" });

const overview: SideNavItem = {
  id: "overview",
  label: "Overview",
  href: "/",
  icon: icon(LayoutDashboard),
};

/** The agency's menu. Items appear only when the person's capabilities allow them. */
export function managerNav(me: Me, counts: { approvals: number }): SideNavGroup[] {
  const reputation: SideNavItem[] = [
    { id: "cases", label: "Cases", href: "/reputation/cases" },
    ...(me.canReadSurveys
      ? [{ id: "responses", label: "Responses", href: "/reputation/responses" }]
      : []),
    ...(me.canViewForms
      ? [
          { id: "forms", label: "Forms & QR", href: "/reputation/forms" },
          { id: "help-requests", label: "Help requests", href: "/reputation/help" },
        ]
      : []),
  ];
  const items: SideNavItem[] = [
    overview,
    {
      id: "reputation",
      label: "Reputation",
      href: "/reputation/cases",
      icon: icon(Star),
      children: reputation,
    },
    ...(me.canManageLocations
      ? [
          {
            id: "approvals",
            label: "Approvals",
            href: "/approvals/accounts",
            icon: icon(ShieldCheck),
            ...(counts.approvals > 0 ? { count: counts.approvals } : {}),
            children: [
              { id: "approvals-accounts", label: "Accounts", href: "/approvals/accounts" },
              { id: "approvals-places", label: "Places", href: "/approvals/places" },
            ],
          },
        ]
      : []),
    {
      id: "clients",
      label: "Clients",
      href: "/clients/places",
      icon: icon(Building2),
      children: [{ id: "clients-places", label: "Places", href: "/clients/places" }],
    },
  ];
  return [{ items }];
}

/** The client's menu: what the role may use, then every module with its lock from the package. */
export function platformNav(me: Me, access: Access): SideNavGroup[] {
  const repLocked = access.reputation === "locked";
  const reputation: SideNavItem = repLocked
    ? { id: "reputation", label: "Reputation", href: "/modules/reputation", locked: true }
    : {
        id: "reputation",
        label: "Reputation",
        href: "/reputation/feedback",
        icon: icon(Star),
        children: [
          { id: "feedback", label: "Feedback", href: "/reputation/feedback" },
          ...(me.canReadSurveys
            ? [{ id: "responses", label: "Responses", href: "/reputation/responses" }]
            : []),
          ...(me.canViewForms ? [{ id: "qr", label: "QR & links", href: "/reputation/qr" }] : []),
        ],
      };
  const main: SideNavItem[] = [
    overview,
    reputation,
    ...(me.canRequestLocations
      ? [{ id: "places", label: "My places", href: "/places", icon: icon(MapPin) }]
      : []),
    ...(me.canRequestSurveys
      ? [{ id: "help", label: "Help", href: "/help", icon: icon(LifeBuoy) }]
      : []),
  ];
  return [
    { items: main },
    {
      title: "Modules",
      items: MODULES.map((m) => ({
        id: m.feature,
        label: m.label,
        href: `/modules/${m.feature}`,
        ...(access[m.feature] === "locked" ? { locked: true } : {}),
      })),
    },
  ];
}

/** The id of the menu entry for a path: the longest route that matches, children over parents. */
export function activeId(pathname: string, groups: SideNavGroup[]): string {
  let best = "";
  let bestLength = -1;
  const visit = (item: SideNavItem) => {
    const href = item.href;
    const matches =
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && href.length >= bestLength) {
      best = item.id;
      bestLength = href.length;
    }
    item.children?.forEach(visit);
  };
  for (const g of groups) g.items.forEach(visit);
  return best;
}

const LABELS: Record<string, string> = {
  reputation: "Reputation",
  ...Object.fromEntries(MODULES.map((m) => [m.feature, m.label])),
};

/** What a module page says. Generic on purpose: package tiers for some modules are still open. */
export function teaserFor(
  feature: string,
  level: Level | undefined,
): { title: string; body: string; locked: boolean } | null {
  const label = LABELS[feature];
  if (!label) return null;
  const locked = level === "locked";
  return {
    title: label,
    locked,
    body: locked
      ? "This module is not part of your plan yet. Your data keeps flowing in, so it is ready the moment it is switched on. Ask the Atrium team about adding it."
      : "This module is on its way. You will find it here when it is ready.",
  };
}
