import { describe, expect, mock, test } from "bun:test";
import { ApiError } from "../src/api";
import { ApprovalsPanel } from "../src/approvals-app";
import { screen, setup, waitFor } from "./helpers";

const request = {
  id: "r1",
  businessName: "Casa Nueva",
  ownerName: "Ana",
  ownerEmail: "ana@x.test",
  firstLocationName: "Centro",
  firstLocationTimeZone: "America/Chicago",
  note: null,
  status: "open" as const,
  createdAt: new Date().toISOString(),
  reason: null,
};
const place = {
  id: "p1",
  name: "Patio",
  clientId: "c",
  clientName: "Olivo",
  status: "pending" as const,
};

const make = (over: Record<string, unknown> = {}) => ({
  onboardingRequests: async () => [request],
  approveOnboarding: mock(async () => ({
    clientId: "c1",
    setupUrl: "http://api/reset-password/tok",
  })),
  rejectOnboarding: mock(async () => undefined),
  places: async () => [place],
  decidePlace: mock(async () => ({ status: "active" })),
  ...over,
});

describe("ApprovalsPanel", () => {
  test("approving an account shows the set-password link once", async () => {
    const client = make();
    const { user } = setup(<ApprovalsPanel client={client} />);
    expect(await screen.findByText("Casa Nueva")).toBeTruthy();
    await user.click(screen.getByText("Approve"));
    expect(await screen.findByText("http://api/reset-password/tok")).toBeTruthy();
    expect(screen.getByText(/shown once/i)).toBeTruthy();
    expect(client.approveOnboarding).toHaveBeenCalledWith("r1");
  });

  test("rejecting an account asks for a reason", async () => {
    const client = make();
    const { user } = setup(<ApprovalsPanel client={client} />);
    await screen.findByText("Casa Nueva");
    await user.click(screen.getByText("Reject"));
    await user.click(screen.getByText("Send rejection"));
    expect(await screen.findByText(/Say why/i)).toBeTruthy();
    expect(client.rejectOnboarding).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Reason"), "not a restaurant");
    await user.click(screen.getByText("Send rejection"));
    await waitFor(() =>
      expect(client.rejectOnboarding).toHaveBeenCalledWith("r1", "not a restaurant"),
    );
  });

  test("the locations tab approves a pending place", async () => {
    const client = make();
    const { user } = setup(<ApprovalsPanel client={client} />);
    await screen.findByText("Casa Nueva");
    await user.click(screen.getByRole("tab", { name: /Locations/ }));
    expect(await screen.findByText("Patio")).toBeTruthy();
    await user.click(screen.getByText("Approve place"));
    await waitFor(() =>
      expect(client.decidePlace).toHaveBeenCalledWith("p1", "approve", undefined),
    );
  });

  test("opens on the tab that has something waiting and counts each tab", async () => {
    const client = make({ onboardingRequests: async () => [] });
    setup(<ApprovalsPanel client={client} />);
    expect(await screen.findByText("Patio")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Locations/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tab", { name: /Locations.*1/ })).toBeTruthy();
  });

  test("pausing a running place asks first and says what it cancels", async () => {
    const running = {
      id: "p2",
      name: "Bellaire",
      clientId: "c",
      clientName: "Olivo",
      status: "active" as const,
    };
    const client = make({ onboardingRequests: async () => [], places: async () => [running] });
    const { user } = setup(<ApprovalsPanel client={client} />);
    await user.click(await screen.findByRole("tab", { name: /Locations/ }));
    await user.click(await screen.findByText("Pause"));
    expect(await screen.findByText(/review requests waiting/i)).toBeTruthy();
    expect(client.decidePlace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Pause place" }));
    await waitFor(() =>
      expect(client.decidePlace).toHaveBeenCalledWith("p2", "suspend", undefined),
    );
  });

  test("rejecting a place needs a reason", async () => {
    const client = make({ onboardingRequests: async () => [] });
    const { user } = setup(<ApprovalsPanel client={client} />);
    await user.click(await screen.findByText("Reject place"));
    await user.click(screen.getByText("Send rejection"));
    expect(await screen.findByText(/Say why/i)).toBeTruthy();
    expect(client.decidePlace).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Reason"), "address not verified");
    await user.click(screen.getByText("Send rejection"));
    await waitFor(() =>
      expect(client.decidePlace).toHaveBeenCalledWith("p1", "reject", "address not verified"),
    );
  });

  test("a failed decision tells the person instead of failing silently", async () => {
    const client = make({
      onboardingRequests: async () => [],
      decidePlace: mock(async () => {
        throw new ApiError(409, "invalid_state");
      }),
    });
    const { user } = setup(<ApprovalsPanel client={client} />);
    await user.click(await screen.findByText("Approve place"));
    expect(await screen.findByText(/already changed|could not/i)).toBeTruthy();
  });

  test("an email that already has an account says so, instead of asking to retry", async () => {
    const client = make({
      approveOnboarding: mock(async () => {
        throw new ApiError(409, "invalid_state");
      }),
    });
    const { user } = setup(<ApprovalsPanel client={client} />);
    await user.click(await screen.findByText("Approve"));
    expect(await screen.findByText(/already has an account/i)).toBeTruthy();
  });
});
