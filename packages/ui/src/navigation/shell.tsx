"use client";

import { ChevronDown, Lock } from "lucide-react";
import { type ComponentProps, type ElementType, type ReactNode, useState } from "react";
import { Badge } from "../feedback/badge";
import { cx } from "../lib/cx";

export type SideNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  count?: number;
  /** A module the package does not include: dimmed, still a link (to its teaser). */
  locked?: boolean;
  children?: SideNavItem[];
};
export type SideNavGroup = { title?: string; items: SideNavItem[] };

export type SideNavProps = {
  /** Omit it when the frame draws its own header (the rail). */
  brand?: ReactNode;
  groups: SideNavGroup[];
  current: string;
  label?: string;
  /** Render links with your router's Link: `linkAs={NextLink}`. */
  linkAs?: ElementType;
  className?: string;
  /** `card` floats on the page; `rail` fills a sidebar from edge to edge. */
  variant?: "card" | "rail";
};

const ROW =
  "flex w-full cursor-pointer items-center gap-3 rounded-sm px-2.5 py-[9px] text-left text-sm no-underline transition-colors duration-(--dur-base) hover:bg-charcoal-700 aria-[current=page]:bg-charcoal-700 aria-[current=page]:text-lime-500 aria-[current=page]:shadow-[inset_3px_0_0_var(--lime-500)] aria-[current=true]:text-lime-500";

/** The Manager's chrome: charcoal, the current page in lime with a 3px lime edge, a clay count for work waiting on a person. */
export function SideNav({
  brand,
  groups,
  current,
  label = "Main",
  linkAs: LinkAs = "a",
  className,
  variant = "card",
}: SideNavProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const count = (n?: number) =>
    n ? (
      <Badge variant="clay" className="ml-auto">
        {n}
      </Badge>
    ) : null;

  return (
    <nav
      aria-label={label}
      className={cx(
        variant === "rail"
          ? "flex w-full flex-col gap-0.5 px-3 py-4 text-cream-300"
          : "flex w-60 flex-col gap-0.5 rounded-md bg-surface-dark px-3 py-4 text-cream-300",
        className,
      )}
    >
      {brand ? (
        <div className="flex items-center justify-between gap-2.5 px-2.5 pb-4 text-cream-200">
          {brand}
        </div>
      ) : null}
      {groups.map((g, gi) => (
        <div key={g.title ?? gi} className="flex flex-col gap-0.5">
          {g.title ? (
            <div className="label-caps mx-2.5 mt-4 mb-1.5 text-charcoal-400">{g.title}</div>
          ) : null}
          {g.items.map((it) => {
            const kids = it.children ?? [];
            if (kids.length > 0) {
              const childCurrent = kids.some((c) => c.id === current);
              const isOpen = open[it.id] ?? childCurrent;
              return (
                <div key={it.id} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-current={childCurrent ? "true" : undefined}
                    onClick={() => setOpen((o) => ({ ...o, [it.id]: !isOpen }))}
                    className={ROW}
                  >
                    {it.icon}
                    {it.label}
                    {it.count ? count(it.count) : <span className="ml-auto" />}
                    <ChevronDown
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden
                      className={isOpen ? "rotate-180" : undefined}
                    />
                  </button>
                  {isOpen ? (
                    <ul className="m-0 ml-[1.15rem] flex list-none flex-col gap-0.5 border-l border-charcoal-700 p-0 pl-2">
                      {kids.map((c) => (
                        <li key={c.id}>
                          <LinkAs
                            href={c.href}
                            aria-current={c.id === current ? "page" : undefined}
                            className={ROW}
                          >
                            {c.label}
                            {count(c.count)}
                          </LinkAs>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            }
            return (
              <LinkAs
                key={it.id}
                href={it.href}
                aria-current={it.id === current ? "page" : undefined}
                data-locked={it.locked ? "true" : undefined}
                className={cx(ROW, it.locked && "opacity-60")}
              >
                {it.icon}
                {it.label}
                {it.locked ? (
                  <Lock
                    size={14}
                    strokeWidth={1.5}
                    role="img"
                    aria-label="Locked"
                    className="ml-auto"
                  />
                ) : (
                  count(it.count)
                )}
              </LinkAs>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Search and the person. Below `lg` the side navigation moves into a menu button placed in `start`. */
export function TopBar({
  start,
  children,
  end,
  className,
  ...rest
}: ComponentProps<"header"> & { start?: ReactNode; end?: ReactNode }) {
  return (
    <header
      className={cx(
        "flex items-center gap-3 rounded-md border border-line bg-surface-card px-5 py-3",
        className,
      )}
      {...rest}
    >
      {start}
      <div className="min-w-0 flex-1">{children}</div>
      {end ? <div className="flex items-center gap-2.5">{end}</div> : null}
    </header>
  );
}

export type AppShellProps = {
  nav: ReactNode;
  topBar?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** The frame of the Manager and the Platform: the side navigation from `lg`, the work area on cream. */
export function AppShell({ nav, topBar, children, className }: AppShellProps) {
  return (
    <div
      className={cx("grid min-h-dvh gap-4 bg-surface-page p-4 lg:grid-cols-[15rem_1fr]", className)}
    >
      <aside className="hidden lg:block">{nav}</aside>
      <div className="flex min-w-0 flex-col gap-4">
        {topBar}
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
