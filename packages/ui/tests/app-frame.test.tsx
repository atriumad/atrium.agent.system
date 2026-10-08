import { describe, expect, mock, test } from "bun:test";
import { ApiError } from "../src/api";
import { PlacesApprovalsPage } from "../src/approvals-app";
import { AppFrame, useMe } from "../src/shell/app-frame";
import { amMe, fakeFetch, ownerMe, restoreFetch } from "./fake-api";
import { screen, setup, waitFor, within } from "./helpers";

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
};

const client = (over: Record<string, unknown> = {}) => ({
  me: async () => ownerMe,
  access: async () => levels,
  onboardingRequests: async () => [] as { status: string }[],
  places: async () => [] as { status: string }[],
  signOut: mock(async () => undefined),
  ...over,
});

describe("AppFrame", () => {
  test("signed out shows the sign-in on any route", async () => {
    setup(
      <AppFrame
        surface="platform"
        pathname="/reputation/qr"
        client={client({
          me: async () => {
            throw new ApiError(401, "unauthorized");
          },
        })}
      >
        content
      </AppFrame>,
    );
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  test("an owner gets the sidebar, the page and the account", async () => {
    setup(
      <AppFrame surface="platform" pathname="/reputation/feedback" client={client()}>
        <p>the page</p>
      </AppFrame>,
    );
    expect(await screen.findByText("the page")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Feedback" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: /Retention/ }).getAttribute("data-locked")).toBe(
      "true",
    );
    expect(screen.getByText(ownerMe.name)).toBeTruthy();
  });

  test("children read the person through useMe", async () => {
    const Who = () => <p>{useMe().role}</p>;
    setup(
      <AppFrame surface="platform" pathname="/" client={client()}>
        <Who />
      </AppFrame>,
    );
    expect(await screen.findByText("client_owner")).toBeTruthy();
  });

  test("the manager's approvals count is accounts plus pending places", async () => {
    setup(
      <AppFrame
        surface="manager"
        pathname="/"
        client={client({
          me: async () => amMe,
          onboardingRequests: async () => [{ status: "open" }, { status: "approved" }],
          places: async () => [{ status: "pending" }, { status: "active" }],
        })}
      >
        x
      </AppFrame>,
    );
    const toggle = await screen.findByRole("button", { name: /Approvals/ });
    await waitFor(() => expect(within(toggle).getByText("2")).toBeTruthy());
  });

  test("if access cannot be read, the page still opens", async () => {
    setup(
      <AppFrame
        surface="platform"
        pathname="/"
        client={client({
          access: async () => {
            throw new Error("down");
          },
        })}
      >
        <p>still here</p>
      </AppFrame>,
    );
    expect(await screen.findByText("still here")).toBeTruthy();
  });

  test("the menu button opens a drawer that Escape closes", async () => {
    const { user } = setup(
      <AppFrame surface="platform" pathname="/" client={client()}>
        x
      </AppFrame>,
    );
    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(Boolean(screen.queryByRole("dialog", { name: "Menu" }))).toBe(false);
  });

  test("sign out goes through the client", async () => {
    const c = client();
    const { user } = setup(
      <AppFrame surface="platform" pathname="/" client={c}>
        x
      </AppFrame>,
    );
    await user.click(await screen.findByText("Sign out"));
    await waitFor(() => expect(c.signOut).toHaveBeenCalled());
  });

  test("shows where the person is as breadcrumbs", async () => {
    setup(
      <AppFrame surface="platform" pathname="/reputation/responses" client={client()}>
        x
      </AppFrame>,
    );
    const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByText("Reputation")).toBeTruthy();
    expect(within(crumbs).getByText("Responses").getAttribute("aria-current")).toBe("page");
  });

  test("the sidebar is a full-height rail, not a floating card", async () => {
    setup(
      <AppFrame surface="platform" pathname="/" client={client()}>
        x
      </AppFrame>,
    );
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(nav.className).not.toContain("rounded");
    expect(nav.closest("aside")?.className).toContain("fixed");
  });

  test("the drawer closes when the page changes", async () => {
    const c = client();
    const { user, rerender } = setup(
      <AppFrame surface="platform" pathname="/" client={c}>
        x
      </AppFrame>,
    );
    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    rerender(
      <AppFrame surface="platform" pathname="/reputation/feedback" client={c}>
        x
      </AppFrame>,
    );
    await waitFor(() =>
      expect(Boolean(screen.queryByRole("dialog", { name: "Menu" }))).toBe(false),
    );
  });

  test("the drawer is really modal: focus moves in and stays in, the page cannot scroll", async () => {
    const { user } = setup(
      <AppFrame surface="platform" pathname="/" client={client()}>
        x
      </AppFrame>,
    );
    const button = await screen.findByRole("button", { name: "Open menu" });
    await user.click(button);
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.body.style.overflow).toBe("hidden");
    for (let i = 0; i < 25; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => expect(document.activeElement === button).toBe(true));
  });

  test("the approvals count follows what the person does on the approval pages", async () => {
    let pending = [
      { id: "p", name: "Patio", clientId: "c", clientName: "Olivo", status: "pending" },
    ];
    const calls = fakeFetch({
      "/api/me": () => amMe,
      "/api/onboarding/requests": { requests: [] },
      "/api/locations": () => ({ locations: pending }),
      "/api/locations/p/decide": () => {
        pending = [{ ...pending[0], status: "active" } as never];
        return { status: "active" };
      },
    });
    const { user } = setup(
      <AppFrame surface="manager" pathname="/approvals/places">
        <PlacesApprovalsPage />
      </AppFrame>,
    );
    const toggle = await screen.findByRole("button", { name: /Approvals/ });
    await waitFor(() => expect(within(toggle).getByText("1")).toBeTruthy());
    await user.click(await screen.findByText("Approve place"));
    await waitFor(() => expect(Boolean(within(toggle).queryByText("1"))).toBe(false));
    expect(calls.some((c) => c.path === "/api/locations/p/decide")).toBe(true);
    restoreFetch();
  });
});
