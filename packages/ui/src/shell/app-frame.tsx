"use client";

import { Menu } from "lucide-react";
import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiError, api, type Me } from "../api";
import { Wordmark } from "../brand/wordmark";
import { SignIn, type Surface } from "../cases-app";
import { Banner } from "../feedback/banner";
import { Container } from "../layout/layout";
import { Breadcrumbs } from "../navigation/links";
import { SideNav } from "../navigation/shell";
import { MeProvider, useMe } from "./me-context";
import { type Access, activeId, crumbsFor, managerNav, platformNav } from "./nav";

export { MeProvider, useMe };

export type FrameClient = {
  me: () => Promise<Me>;
  access: () => Promise<Record<string, string>>;
  onboardingRequests: () => Promise<{ status: string }[]>;
  places: () => Promise<{ status: string }[]>;
  signOut: () => Promise<unknown>;
};

function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-charcoal-900/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface-dark"
      >
        {children}
      </div>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

function AccountMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-charcoal-800 text-xs text-cream-100"
      >
        {initials(me.name)}
      </span>
      <span className="hidden text-left leading-tight sm:block">
        <span className="block">{me.name}</span>
        <span className="block text-xs text-fg-muted">{me.role.replaceAll("_", " ")}</span>
      </span>
      <button
        type="button"
        onClick={onSignOut}
        className="cursor-pointer text-fg-muted underline underline-offset-4 hover:text-clay-600"
      >
        Sign out
      </button>
    </div>
  );
}

/**
 * Signs the person in if needed, then draws the dashboard: sidebar, top bar and the page. The
 * menu comes from who they are and, for a client, from what their package opens.
 */
export function AppFrame({
  surface,
  pathname,
  linkAs,
  client = api,
  children,
}: {
  surface: Surface;
  pathname: string;
  linkAs?: ElementType;
  client?: FrameClient;
  children: ReactNode;
}) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [approvals, setApprovals] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    client
      .me()
      .then(setMe)
      .catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setMe(null);
        else setUnreachable(true);
      });
  }, [client]);

  useEffect(() => {
    if (!me) return;
    if (surface === "platform") {
      client
        .access()
        .then((levels) => setAccess(levels as Access))
        .catch(() => setAccess({}));
    }
    if (surface === "manager" && me.canManageLocations) {
      Promise.all([
        client.onboardingRequests().catch(() => []),
        client.places().catch(() => []),
      ]).then(([accounts, places]) =>
        setApprovals(
          accounts.filter((a) => a.status === "open").length +
            places.filter((p) => p.status === "pending").length,
        ),
      );
    }
  }, [me, surface, client]);

  const closeDrawer = () => {
    setDrawer(false);
    menuButton.current?.focus();
  };

  async function signOut() {
    await client.signOut().catch(() => undefined);
    try {
      location.reload();
    } catch {
      // Not every environment can reload; the next request signs out anyway.
    }
  }

  if (unreachable) {
    return (
      <Container className="py-16">
        <Banner status="danger" title="Cannot reach the server">
          Check that the API is running, then reload.
        </Banner>
      </Container>
    );
  }
  if (me === undefined) return <Container className="py-8" />;
  if (me === null) return <SignIn surface={surface} />;
  // A client's menu waits for its package so locked modules never flash open.
  if (surface === "platform" && access === null) return <Container className="py-8" />;

  const groups =
    surface === "manager" ? managerNav(me, { approvals }) : platformNav(me, access ?? {});
  const current = activeId(pathname, groups);
  const crumbs = crumbsFor(groups, current);
  const nav = (
    <SideNav variant="rail" groups={groups} current={current} {...(linkAs ? { linkAs } : {})} />
  );
  const brand = (
    <div className="flex h-14 shrink-0 items-center border-b border-charcoal-700 px-5">
      <Wordmark size="sm" tone="cream" />
    </div>
  );

  return (
    <MeProvider me={me}>
      <div
        className="min-h-dvh bg-surface-page"
        style={{ "--row-py": surface === "manager" ? "0.75rem" : "1.125rem" } as CSSProperties}
      >
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-charcoal-700 bg-surface-dark lg:flex">
          {brand}
          <div className="flex-1 overflow-y-auto">{nav}</div>
        </aside>
        <div className="flex min-h-dvh flex-col lg:pl-64">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-card px-4 lg:px-8">
            <button
              ref={menuButton}
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawer(true)}
              className="-ml-1 cursor-pointer rounded-sm p-1.5 hover:bg-cream-200 lg:hidden"
            >
              <Menu size={20} strokeWidth={1.5} aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              {crumbs.length > 0 ? (
                <Breadcrumbs items={crumbs} {...(linkAs ? { linkAs } : {})} />
              ) : null}
            </div>
            <AccountMenu me={me} onSignOut={signOut} />
          </header>
          <main
            id="main"
            className={`min-w-0 flex-1 px-4 lg:px-8 ${surface === "manager" ? "py-6" : "py-10"}`}
          >
            <div className="mx-auto w-full max-w-[1200px]">{children}</div>
          </main>
        </div>
      </div>
      {drawer ? (
        <Drawer onClose={closeDrawer}>
          {brand}
          {nav}
        </Drawer>
      ) : null}
    </MeProvider>
  );
}
