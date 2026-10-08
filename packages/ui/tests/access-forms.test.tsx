import { afterEach, describe, expect, mock, test } from "bun:test";
import { RequestAccessForm } from "../src/request-access";
import { SetPasswordForm } from "../src/set-password";
import { screen, setup, waitFor } from "./helpers";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("RequestAccessForm", () => {
  test("sends the business, owner and first place, then thanks them", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { user } = setup(<RequestAccessForm />);
    await user.type(screen.getByLabelText("Business name"), "Casa Nueva");
    await user.type(screen.getByLabelText("Your name"), "Ana");
    await user.type(screen.getByLabelText("Your email"), "ana@x.test");
    await user.type(screen.getByLabelText("First place"), "Centro");
    await user.click(screen.getByText("Request access"));
    expect(await screen.findByText(/We got your request/i)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/onboarding-api");
    expect(JSON.parse(init.body as string)).toMatchObject({
      businessName: "Casa Nueva",
      ownerName: "Ana",
      ownerEmail: "ana@x.test",
      firstLocationName: "Centro",
    });
  });

  test("asks for the missing pieces instead of sending", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 202 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { user } = setup(<RequestAccessForm />);
    await user.click(screen.getByText("Request access"));
    expect(await screen.findByText(/Fill in every field/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SetPasswordForm", () => {
  test("sets the password with the token from the link", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { user } = setup(<SetPasswordForm token="tok123" />);
    await user.type(screen.getByLabelText("New password"), "a-long-password-123");
    await user.type(screen.getByLabelText("Repeat the password"), "a-long-password-123");
    await user.click(screen.getByText("Set password"));
    expect(await screen.findByText(/Your password is set/i)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(init.body as string)).toEqual({
      newPassword: "a-long-password-123",
      token: "tok123",
    });
  });

  test("refuses a short password or one that does not match", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { user } = setup(<SetPasswordForm token="tok123" />);
    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Repeat the password"), "short");
    await user.click(screen.getByText("Set password"));
    expect(await screen.findByText(/at least 12/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("tells them when the link is no longer valid", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ code: "INVALID_TOKEN" }), { status: 400 }),
    ) as unknown as typeof fetch;
    const { user } = setup(<SetPasswordForm token="old" />);
    await user.type(screen.getByLabelText("New password"), "a-long-password-123");
    await user.type(screen.getByLabelText("Repeat the password"), "a-long-password-123");
    await user.click(screen.getByText("Set password"));
    await waitFor(() => expect(screen.getByText(/link has expired|not valid/i)).toBeTruthy());
  });
});
