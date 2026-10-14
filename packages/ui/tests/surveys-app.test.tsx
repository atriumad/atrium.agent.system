import { afterEach, describe, expect, test } from "bun:test";
import { MeProvider } from "../src/shell/me-context";
import { FormCard, HelpPage, HelpRequestsPage, ResponsesPage } from "../src/surveys-app";
import { amMe, fakeFetch, meOf, ownerMe, restoreFetch } from "./fake-api";
import { screen, setup, waitFor } from "./helpers";

afterEach(restoreFetch);

const form = {
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Bellaire",
  clientId: "c",
  clientName: "Casa Olivo",
  reviewUrl: "https://g.page/r/abc/review",
  requestDelayMinutes: 120,
  qrVersion: 1,
  status: "active" as const,
  qrPath: "/q/x",
  qrUrl: "http://hub.test/q/x",
};

describe("FormCard capabilities", () => {
  test("an owner can generate a link but not rotate the QR or edit the review link", () => {
    setup(<FormCard form={form} onChanged={() => {}} canManage={false} canOperate />);
    expect(screen.getByText("Generate link")).toBeTruthy();
    expect(screen.queryByText("Rotate QR")).toBeNull();
    expect((screen.getByLabelText(/Google review link/i) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Help tab/i)).toBeTruthy();
  });

  test("the agency sees every control", () => {
    setup(<FormCard form={form} onChanged={() => {}} canManage canOperate />);
    expect(screen.getByText("Rotate QR")).toBeTruthy();
    expect((screen.getByLabelText(/Google review link/i) as HTMLInputElement).disabled).toBe(false);
  });

  test("a place waiting for approval shows no QR and no link button", () => {
    setup(
      <FormCard
        form={{ ...form, status: "pending", qrUrl: null }}
        onChanged={() => {}}
        canManage={false}
        canOperate
      />,
    );
    expect(screen.getByText("Waiting for approval")).toBeTruthy();
    expect(screen.queryByText("Generate link")).toBeNull();
    expect(screen.queryByText("Copy QR link")).toBeNull();
  });
});

const REQ_ID = "22222222-2222-4222-8222-222222222222";
const RESP_ID = "33333333-3333-4333-8333-333333333333";
const aRequest = {
  id: REQ_ID,
  clientName: "Casa Olivo",
  locationName: "Bellaire",
  requestedByName: "Olivia Owner",
  note: "Change the link",
  status: "open",
  createdAt: new Date().toISOString(),
  handledAt: null,
  response: null,
  lastMessageAt: new Date().toISOString(),
  lastAuthorSide: "client",
  lastPreview: "Change the link",
  awaiting: "agency",
};
const aResponse = {
  id: RESP_ID,
  clientName: "Casa Olivo",
  locationName: "Bellaire",
  rating: 2,
  bestPart: null,
  improve: null,
  comment: "Slow service",
  wantsContact: false,
  source: "qr",
  reviewClicked: false,
  caseId: null,
  createdAt: new Date().toISOString(),
};
const places = {
  "/api/surveys/locations": {
    locations: [{ id: "l1", locationName: "Bellaire", clientName: "Casa Olivo" }],
  },
};
const asMe = (me: typeof ownerMe, ui: React.ReactNode) =>
  setup(<MeProvider me={me}>{ui}</MeProvider>);

/** Points the DOM at `url` for one test (the page reads its query string from `window.location`). */
function at(url: string) {
  const before = `${window.location.pathname}${window.location.search}`;
  window.history.pushState({}, "", url);
  return () => window.history.pushState({}, "", before);
}

describe("HelpRequestsPage", () => {
  test("the account manager sees the threads with the composer", async () => {
    fakeFetch({
      "/api/surveys/requests": { requests: [aRequest] },
      [`/api/surveys/requests/${REQ_ID}`]: { request: aRequest, messages: [] },
    });
    const { user } = asMe(amMe, <HelpRequestsPage />);
    await user.click(await screen.findByText("Bellaire"));
    expect(await screen.findByText("Decline")).toBeTruthy();
    expect(screen.getByLabelText("Message")).toBeTruthy();
  });

  test("agency staff see the threads but no composer or close buttons", async () => {
    const staff = meOf({
      role: "agency_staff",
      kind: "assigned",
      canReadSurveys: true,
      canViewForms: true,
    });
    fakeFetch({
      "/api/surveys/requests": { requests: [aRequest] },
      [`/api/surveys/requests/${REQ_ID}`]: { request: aRequest, messages: [] },
    });
    const { user } = asMe(staff, <HelpRequestsPage />);
    await user.click(await screen.findByText("Bellaire"));
    await waitFor(() => expect(screen.getByLabelText("Conversation")).toBeTruthy());
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByText("Decline")).toBeNull();
    expect(screen.queryByText("Mark as solved")).toBeNull();
  });
});

describe("HelpPage", () => {
  test("an empty message is refused on the client and nothing is sent", async () => {
    const calls = fakeFetch({ ...places, "/api/surveys/requests": { requests: [] } });
    const { user } = asMe(ownerMe, <HelpPage />);
    await user.click(await screen.findByText("Send request"));
    expect(await screen.findByText("Write a message first.")).toBeTruthy();
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  test("a written message is sent with the place", async () => {
    const calls = fakeFetch({
      ...places,
      "/api/surveys/requests": { requests: [], id: REQ_ID },
    });
    const { user } = asMe(ownerMe, <HelpPage />);
    await user.type(await screen.findByLabelText(/What do you need/), "New QR please");
    await user.click(screen.getByText("Send request"));
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === "POST");
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        locationId: "l1",
        note: "New QR please",
      });
    });
  });

  test("?response= attaches that response as a removable chip and sends it", async () => {
    const restore = at(`/help?response=${RESP_ID}`);
    try {
      const calls = fakeFetch({
        ...places,
        "/api/surveys/requests": { requests: [] },
        "/api/surveys/responses/pickable": {
          responses: [
            {
              id: RESP_ID,
              createdAt: new Date().toISOString(),
              rating: 2,
              excerpt: "Slow service",
              locationName: "Bellaire",
            },
          ],
        },
      });
      const { user } = asMe(ownerMe, <HelpPage />);
      expect(await screen.findByText(/Slow service/)).toBeTruthy();
      await user.type(screen.getByLabelText(/What do you need/), "About this one");
      await user.click(screen.getByText("Send request"));
      await waitFor(() => {
        const post = calls.find((c) => c.init?.method === "POST");
        expect(JSON.parse(String(post?.init?.body))).toEqual({
          locationId: "l1",
          note: "About this one",
          attachment: { kind: "response", responseId: RESP_ID },
        });
      });
    } finally {
      restore();
    }
  });

  test("the attached response can be removed before sending", async () => {
    const restore = at(`/help?response=${RESP_ID}`);
    try {
      fakeFetch({ ...places, "/api/surveys/requests": { requests: [] } });
      const { user } = asMe(ownerMe, <HelpPage />);
      expect(await screen.findByText("Survey response")).toBeTruthy();
      await user.click(screen.getByLabelText("Remove attachment"));
      expect(screen.queryByText("Survey response")).toBeNull();
    } finally {
      restore();
    }
  });
});

describe("ResponsesPage ask for help", () => {
  test("an owner gets a link to the help page with the response", async () => {
    fakeFetch({ "/api/surveys/responses": { responses: [aResponse] } });
    asMe(ownerMe, <ResponsesPage />);
    // The Button contract for links renders an <a href> carrying role="button".
    const link = await screen.findByRole("button", { name: "Ask for help about this" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(`/help?response=${RESP_ID}`);
  });

  test("agency roles do not get it", async () => {
    fakeFetch({ "/api/surveys/responses": { responses: [aResponse] } });
    asMe(amMe, <ResponsesPage />);
    expect(await screen.findByText("Slow service")).toBeTruthy();
    expect(screen.queryByText("Ask for help about this")).toBeNull();
  });
});
