"use client";

import { AlertTriangle, Bell, MapPin, MessageCircle } from "lucide-react";
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
import { Tabs } from "../navigation/tabs";
import {
  firstLine,
  GROUP_LABEL,
  groupByDay,
  type NotificationType,
  notificationAction,
  notificationType,
} from "./notification-view";

export type NotificationsClient = {
  notifications: () => Promise<{ notifications: AppNotification[]; unread: number }>;
  markNotificationsRead: (which: { ids: string[] } | { all: true }) => Promise<unknown>;
};

/**
 * The page where a person can act on a notification of this kind, or null when there is none.
 * With a target of the right type the link opens that case, place or request, not just the list.
 */
export function notificationHref(
  kind: string,
  surface: Surface,
  target: AppNotification["target"] = null,
): string | null {
  const page = pageFor(kind, surface);
  if (!page) return null;
  if (!target || target.type !== page.targetType) return page.path;
  return `${page.path}?${page.param}=${encodeURIComponent(target.id)}`;
}

function pageFor(
  kind: string,
  surface: Surface,
): {
  path: string;
  targetType: NonNullable<AppNotification["target"]>["type"];
  param: string;
} | null {
  switch (kind) {
    case "core.location_requested":
      return surface === "manager"
        ? { path: "/approvals/places", targetType: "location", param: "place" }
        : null;
    case "core.location_decided":
      return surface === "platform"
        ? { path: "/places", targetType: "location", param: "place" }
        : null;
    case "reputation.case_alert":
    case "reputation.case_resolved":
      return {
        path: surface === "manager" ? "/reputation/cases" : "/reputation/feedback",
        targetType: "case",
        param: "case",
      };
    case "reputation.help_message":
      return {
        path: surface === "manager" ? "/reputation/help" : "/help",
        targetType: "help_request",
        param: "request",
      };
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

const TYPE_ICON = { case: AlertTriangle, place: MapPin, help: MessageCircle, other: Bell } as const;
const TYPE_TINT: Record<NotificationType, string> = {
  case: "bg-status-danger-bg text-status-danger-fg",
  place: "bg-status-info-bg text-status-info-fg",
  help: "bg-status-warning-bg text-status-warning-fg",
  other: "bg-status-neutral-bg text-status-neutral-fg",
};

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
  const href = notificationHref(n.kind, surface, n.target);
  const type = notificationType(n.kind);
  const Icon = TYPE_ICON[type];
  const action = notificationAction(n.kind, n.target);
  const inner = (
    <span className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-control ${TYPE_TINT[type]}`}
      >
        <Icon size={16} strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`flex items-start gap-2 text-sm ${unread ? "font-medium text-fg-strong" : "text-fg-body"}`}
        >
          <span className="min-w-0 flex-1">{n.subject ?? n.kind}</span>
          {unread ? (
            <>
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-clay-500"
              />
              <span className="sr-only">Unread</span>
            </>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm text-fg-muted">
          {showBody ? n.body : firstLine(n.body)}
        </span>
        <span className="mt-1 flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span>{ago(n.createdAt, new Date())}</span>
          {action ? <span className="font-medium text-fg-strong">{action} →</span> : null}
        </span>
      </span>
    </span>
  );
  const cls = `block w-full cursor-pointer text-left no-underline hover:bg-surface-sunken ${
    unread ? "bg-surface-page" : ""
  }`;
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
  const [tab, setTab] = useState<"all" | "unread">("all");
  const shown = (data?.notifications ?? []).filter((n) => tab === "all" || !n.readAt).slice(0, 12);
  const groups = groupByDay(shown, new Date());

  return (
    <>
      <span role="status" className="sr-only">
        {unread > 0 ? `${unread} unread notifications` : ""}
      </span>
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
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
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
        <div className="border-b border-line px-4 py-2">
          <Tabs
            label="Filter notifications"
            value={tab}
            onValueChange={(v) => setTab(v as "all" | "unread")}
            items={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread", count: unread },
            ]}
          />
        </div>
        {groups.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-fg-muted">
            {tab === "unread" ? "No unread notifications." : "You are all caught up."}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {groups.map((g) => (
              <section key={g.group}>
                <h3 className="label-caps m-0 bg-surface-sunken px-4 py-2 text-fg-muted">
                  {GROUP_LABEL[g.group]}
                </h3>
                <ul className="m-0 list-none divide-y divide-line p-0">
                  {g.items.map((n) => (
                    <Row
                      key={n.id}
                      n={n}
                      surface={surface}
                      linkAs={LinkAs}
                      onOpen={(x) => !x.readAt && markRead({ ids: [x.id] })}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <div className="border-t border-line px-4 py-3 text-sm">
          <LinkAs href="/notifications" className="underline underline-offset-4">
            See all
          </LinkAs>
        </div>
      </Popover>
    </>
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
