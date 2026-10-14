"use client";

import { Bell } from "lucide-react";
import { type ElementType, useCallback, useEffect, useState } from "react";
import { Button } from "../actions/button";
import { type AppNotification, api } from "../api";
import type { Surface } from "../cases-app";
import { Skeleton } from "../data/misc";
import { Popover } from "../feedback/overlays";
import { EmptyState, ErrorState } from "../feedback/states";
import { ago } from "../format";
import { PageHeader } from "../layout/layout";
import { ListPanel, ROW_PAD } from "../layout/list-panel";

export type NotificationsClient = {
  notifications: () => Promise<{ notifications: AppNotification[]; unread: number }>;
  markNotificationsRead: (which: { ids: string[] } | { all: true }) => Promise<unknown>;
};

/** The page where a person can act on a notification of this kind, or null when there is none. */
export function notificationHref(kind: string, surface: Surface): string | null {
  switch (kind) {
    case "core.location_requested":
      return surface === "manager" ? "/approvals/places" : null;
    case "core.location_decided":
      return surface === "platform" ? "/places" : null;
    case "reputation.case_alert":
      return surface === "manager" ? "/reputation/cases" : "/reputation/feedback";
    case "reputation.help_message":
      return surface === "manager" ? "/reputation/help" : "/help";
    default:
      return null;
  }
}

const POLL_MS = 60_000;

function useNotifications(client: NotificationsClient) {
  const [data, setData] = useState<{ notifications: AppNotification[]; unread: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    client
      .notifications()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [client]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const markRead = useCallback(
    async (which: { ids: string[] } | { all: true }) => {
      await client.markNotificationsRead(which).catch(() => undefined);
      load();
    },
    [client, load],
  );

  return { data, failed, load, markRead };
}

function Row({
  n,
  surface,
  linkAs: LinkAs = "a",
  onOpen,
  showBody,
}: {
  n: AppNotification;
  surface: Surface;
  linkAs?: ElementType;
  onOpen: (n: AppNotification) => void;
  showBody?: boolean;
}) {
  const unread = !n.readAt;
  const href = notificationHref(n.kind, surface);
  const inner = (
    <span className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-clay-500" : "bg-transparent"}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${unread ? "font-medium text-fg-strong" : "text-fg-body"}`}>
          {n.subject ?? n.kind}
        </span>
        {showBody ? <span className="mt-0.5 block text-sm text-fg-muted">{n.body}</span> : null}
        <span className="mt-0.5 block text-xs text-fg-muted">{ago(n.createdAt, new Date())}</span>
      </span>
    </span>
  );
  const cls = "block w-full cursor-pointer text-left no-underline hover:bg-surface-sunken";
  return (
    <li>
      {href ? (
        <LinkAs href={href} onClick={() => onOpen(n)} className={`${cls} ${ROW_PAD}`}>
          {inner}
        </LinkAs>
      ) : (
        <button type="button" onClick={() => onOpen(n)} className={`${cls} ${ROW_PAD}`}>
          {inner}
        </button>
      )}
    </li>
  );
}

/** The bell in the top bar: a count, a short list, and the way to the full page. */
export function NotificationsMenu({
  surface,
  linkAs: LinkAs = "a",
  client = api,
}: {
  surface: Surface;
  linkAs?: ElementType;
  client?: NotificationsClient;
}) {
  const { data, load, markRead } = useNotifications(client);
  const unread = data?.unread ?? 0;
  const recent = (data?.notifications ?? []).slice(0, 8);

  return (
    <Popover
      className="w-[22rem] max-w-[92vw] p-0"
      onOpenChange={(open) => open && load()}
      trigger={
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative cursor-pointer rounded-sm p-2 hover:bg-cream-200"
        >
          <Bell size={20} strokeWidth={1.5} aria-hidden />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-clay-500 px-1 text-[0.65rem] leading-4 text-cream-100"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="m-0 text-base font-normal">Notifications</h2>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => markRead({ all: true })}
            className="cursor-pointer text-sm text-fg-muted underline underline-offset-4 hover:text-clay-600"
          >
            Mark all as read
          </button>
        ) : null}
      </div>
      {recent.length === 0 ? (
        <p className="m-0 px-4 py-8 text-center text-sm text-fg-muted">You are all caught up.</p>
      ) : (
        <ul className="m-0 max-h-96 list-none divide-y divide-line overflow-y-auto p-0">
          {recent.map((n) => (
            <Row
              key={n.id}
              n={n}
              surface={surface}
              linkAs={LinkAs}
              onOpen={(x) => !x.readAt && markRead({ ids: [x.id] })}
            />
          ))}
        </ul>
      )}
      <div className="border-t border-line px-4 py-3 text-sm">
        <LinkAs href="/notifications" className="underline underline-offset-4">
          See all
        </LinkAs>
      </div>
    </Popover>
  );
}

/** Everything that was sent to the person, newest first. */
export function NotificationsPage({
  surface,
  linkAs,
  client = api,
}: {
  surface: Surface;
  linkAs?: ElementType;
  client?: NotificationsClient;
}) {
  const { data, failed, load, markRead } = useNotifications(client);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Notifications"
        description="What happened that needs you, and what was decided."
        actions={
          data && data.unread > 0 ? (
            <Button variant="outline" size="sm" onClick={() => markRead({ all: true })}>
              Mark all as read
            </Button>
          ) : null
        }
      />
      {failed ? <ErrorState title="Could not load notifications" onRetry={load} /> : null}
      {data === null && !failed ? <Skeleton className="h-24 w-full" /> : null}
      {data && data.notifications.length === 0 ? (
        <EmptyState title="Nothing yet">
          Case alerts and decisions about your places show up here.
        </EmptyState>
      ) : null}
      {data && data.notifications.length > 0 ? (
        <ListPanel aria-label="Notifications">
          {data.notifications.map((n) => (
            <Row
              key={n.id}
              n={n}
              surface={surface}
              {...(linkAs ? { linkAs } : {})}
              showBody
              onOpen={(x) => !x.readAt && markRead({ ids: [x.id] })}
            />
          ))}
        </ListPanel>
      ) : null}
    </div>
  );
}
