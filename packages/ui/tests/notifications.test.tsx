import { describe, expect, mock, test } from "bun:test";
import { NotificationsMenu, NotificationsPage, notificationHref } from "../src/shell/notifications";
import { screen, setup, waitFor } from "./helpers";

const mins = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const items = [
  {
    id: "n1",
    kind: "core.location_requested",
    subject: "A new location is waiting for approval: Patio",
    body: "Patio was requested.",
    createdAt: mins(3),
    readAt: null,
  },
  {
    id: "n2",
    kind: "reputation.case_alert",
    subject: "A guest needs a reply at Bellaire (high)",
    body: "Rating 1.",
    createdAt: mins(90),
    readAt: null,
  },
  {
    id: "n3",
    kind: "core.location_decided",
    subject: "Heights is now active",
    body: "Done.",
    createdAt: mins(60 * 30),
    readAt: mins(60 * 29),
  },
];

const make = (over: Record<string, unknown> = {}) => {
  let state = items.map((n) => ({ ...n }));
  return {
    notifications: mock(async () => ({
      notifications: state,
      unread: state.filter((n) => !n.readAt).length,
    })),
    markNotificationsRead: mock(async (which: { ids: string[] } | { all: true }) => {
      state = state.map((n) =>
        "all" in which || which.ids.includes(n.id) ? { ...n, readAt: n.readAt ?? mins(0) } : n,
      );
    }),
    ...over,
  };
};

describe("notificationHref", () => {
  test("sends each kind to the page where the person can act on it", () => {
    expect(notificationHref("core.location_requested", "manager")).toBe("/approvals/places");
    expect(notificationHref("core.location_decided", "platform")).toBe("/places");
    expect(notificationHref("reputation.case_alert", "manager")).toBe("/reputation/cases");
    expect(notificationHref("reputation.case_alert", "platform")).toBe("/reputation/feedback");
    expect(notificationHref("reputation.case_resolved", "manager")).toBe("/reputation/cases");
    expect(notificationHref("reputation.case_resolved", "platform")).toBe("/reputation/feedback");
    expect(notificationHref("reputation.help_message", "manager")).toBe("/reputation/help");
    expect(notificationHref("reputation.help_message", "platform")).toBe("/help");
    expect(notificationHref("something.else", "platform")).toBeNull();
  });
});

describe("NotificationsMenu", () => {
  test("the bell says how many are unread and the list shows them", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    const bell = await screen.findByLabelText(/Notifications, 2 unread/);
    await user.click(bell);
    expect(await screen.findByText(/A new location is waiting for approval/)).toBeTruthy();
    expect(screen.getByText(/A guest needs a reply at Bellaire/)).toBeTruthy();
    expect(screen.getByText("See all").getAttribute("href")).toBe("/notifications");
  });

  test("mark all as read clears the count", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    await user.click(await screen.findByText("Mark all as read"));
    await waitFor(() => expect(client.markNotificationsRead).toHaveBeenCalledWith({ all: true }));
    await waitFor(() => expect(Boolean(screen.queryByLabelText(/2 unread/))).toBe(false));
  });

  test("opening one marks only that one as read", async () => {
    const client = make();
    const { user } = setup(<NotificationsMenu surface="manager" client={client} />);
    await user.click(await screen.findByLabelText(/Notifications, 2 unread/));
    await user.click(await screen.findByText(/A guest needs a reply at Bellaire/));
    await waitFor(() => expect(client.markNotificationsRead).toHaveBeenCalledWith({ ids: ["n2"] }));
  });

  test("with nothing new it says so", async () => {
    const client = make({
      notifications: async () => ({ notifications: [], unread: 0 }),
    });
    const { user } = setup(<NotificationsMenu surface="platform" client={client} />);
    await user.click(await screen.findByLabelText("Notifications"));
    expect(await screen.findByText(/all caught up/i)).toBeTruthy();
  });

  test("if they cannot be loaded the bell still works and says nothing is wrong with the page", async () => {
    const client = make({
      notifications: async () => {
        throw new Error("down");
      },
    });
    setup(<NotificationsMenu surface="platform" client={client} />);
    expect(await screen.findByLabelText("Notifications")).toBeTruthy();
  });
});

describe("NotificationsPage", () => {
  test("lists everything, read and unread, and can mark all as read", async () => {
    const client = make();
    const { user } = setup(<NotificationsPage surface="manager" client={client} />);
    expect(await screen.findByText("Heights is now active")).toBeTruthy();
    expect(screen.getByText(/A new location is waiting for approval/)).toBeTruthy();
    await user.click(screen.getByText("Mark all as read"));
    await waitFor(() => expect(client.markNotificationsRead).toHaveBeenCalledWith({ all: true }));
  });
});
