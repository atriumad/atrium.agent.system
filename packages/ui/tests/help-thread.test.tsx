import { afterEach, describe, expect, test } from "bun:test";
import { HelpThreads } from "../src/help-thread";
import { MeProvider } from "../src/shell/me-context";
import { amMe, fakeFetch, ownerMe, restoreFetch } from "./fake-api";
import { screen, setup, waitFor, within } from "./helpers";

afterEach(restoreFetch);

const ID = "11111111-1111-4111-8111-111111111111";
const base = (over: Record<string, unknown> = {}) => ({
  id: ID,
  clientName: "Casa Olivo",
  locationName: "Bellaire",
  requestedByName: "Olivia Owner",
  note: "Help",
  status: "open",
  createdAt: new Date().toISOString(),
  handledAt: null,
  response: null,
  lastMessageAt: new Date().toISOString(),
  lastAuthorSide: "client",
  lastPreview: "Help",
  awaiting: "agency",
  ...over,
});
const msg = (id: string, side: "client" | "agency", body: string, attachment: unknown = null) => ({
  id,
  side,
  body,
  attachment,
  authorName: side === "client" ? "Olivia Owner" : "Alex Manager",
  createdAt: new Date().toISOString(),
});
const routes = (request = base(), messages = [msg("m1", "client", "Help")]) => ({
  "/api/surveys/requests": { requests: [request] },
  [`/api/surveys/requests/${ID}`]: { request, messages },
});
const asOwner = (ui: React.ReactNode) => setup(<MeProvider me={ownerMe}>{ui}</MeProvider>);
const asAm = (ui: React.ReactNode) => setup(<MeProvider me={amMe}>{ui}</MeProvider>);

/** `fakeFetch` ignores the method, so a POST that must fail is intercepted here. */
function failPost(suffix: string) {
  const inner = globalThis.fetch;
  const posts: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith(suffix) && init?.method === "POST") {
      posts.push(String(init.body));
      return new Response("{}", { status: 500 });
    }
    return inner(input, init);
  }) as typeof fetch;
  return posts;
}

const posted = (calls: { path: string; init?: RequestInit }[], suffix: string) =>
  calls.filter((c) => c.path.endsWith(suffix) && c.init?.method === "POST");
const bodyOf = (c: { init?: RequestInit } | undefined) => JSON.parse(String(c?.init?.body));

const open = async (user: ReturnType<typeof setup>["user"]) =>
  user.click(await screen.findByText("Bellaire"));

describe("HelpThreads", () => {
  test("the agency sees whose turn it is and opens the conversation", async () => {
    fakeFetch(routes(base(), [msg("m1", "client", "Help"), msg("m2", "agency", "On it")]));
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    const list = await screen.findByRole("list", { name: "Help requests" });
    expect(within(list).getByText("Waiting for you")).toBeTruthy();
    await user.click(within(list).getByText("Bellaire"));
    const convo = await screen.findByRole("region", { name: "Conversation" });
    expect(within(convo).getByText("Help")).toBeTruthy();
    expect(within(convo).getByText("On it")).toBeTruthy();
  });

  test("the owner sees the other side's turn and labelled authors", async () => {
    fakeFetch(
      routes(base({ awaiting: "agency" }), [
        msg("m1", "client", "Help"),
        msg("m2", "agency", "On it"),
      ]),
    );
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    const list = await screen.findByRole("list", { name: "Help requests" });
    expect(within(list).getByText("Waiting for Atrium")).toBeTruthy();
    await user.click(within(list).getByText("Bellaire"));
    const convo = await screen.findByRole("region", { name: "Conversation" });
    expect(await within(convo).findByText("Atrium team")).toBeTruthy();
    expect(within(convo).getByText("You")).toBeTruthy();
  });

  test("a response attachment renders as a card", async () => {
    const response = {
      kind: "response",
      response: {
        id: "r1",
        locationName: "Bellaire",
        rating: 2,
        comment: "Cold food",
        bestPart: null,
        improve: null,
        sentiment: "negative",
        topics: ["food"],
        concern: null,
        safety: null,
        createdAt: new Date().toISOString(),
      },
    };
    fakeFetch(routes(base(), [msg("m1", "client", "See this", response)]));
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(user);
    const convo = await screen.findByRole("region", { name: "Conversation" });
    expect(await within(convo).findByText("2/5")).toBeTruthy();
    expect(within(convo).getByText("Cold food")).toBeTruthy();
    expect(within(convo).getByText(/survey response · bellaire/i)).toBeTruthy();
  });

  test("a response that is gone says so", async () => {
    fakeFetch(
      routes(base(), [msg("m1", "client", "See this", { kind: "response", response: null })]),
    );
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(user);
    expect(await screen.findByText("This response is no longer available.")).toBeTruthy();
  });

  test("a review attachment is an external link with the pasted text", async () => {
    const review = {
      kind: "review",
      url: "https://maps.google.com/?cid=1",
      rating: 1,
      text: "Never again",
    };
    fakeFetch(routes(base(), [msg("m1", "client", "Unfair", review)]));
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    const link = await screen.findByRole("link", { name: /maps\.google\.com/i });
    expect(link.getAttribute("href")).toBe("https://maps.google.com/?cid=1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getByText("Never again")).toBeTruthy();
    expect(screen.getByText("1/5")).toBeTruthy();
  });

  test("pasted review text and links are inert", async () => {
    const review = {
      kind: "review",
      url: "https://maps.google.com/?cid=1",
      rating: 1,
      text: "<script>alert(1)</script><b>x</b>",
    };
    fakeFetch(routes(base(), [msg("m1", "client", "Unfair", review)]));
    const { container, user } = asOwner(
      <HelpThreads canDecline={false} canWrite pollMs={60_000} />,
    );
    await open(user);
    expect(await screen.findByText("<script>alert(1)</script><b>x</b>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  test("a non-https review url is never a link", async () => {
    const review = { kind: "review", url: "javascript:alert(1)", rating: null, text: null };
    fakeFetch(routes(base(), [msg("m1", "client", "Odd", review)]));
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    await screen.findByText("External review");
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("sending posts the body, clears the box and reloads the thread", async () => {
    let threadLoads = 0;
    const r = routes();
    const calls = fakeFetch({
      ...r,
      [`/api/surveys/requests/${ID}`]: () => {
        threadLoads += 1;
        return r[`/api/surveys/requests/${ID}`];
      },
      [`/api/surveys/requests/${ID}/messages`]: { id: "m9" },
    });
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    const box = (await screen.findByLabelText("Message")) as HTMLTextAreaElement;
    await user.type(box, "Still broken");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(box.value).toBe(""));
    const sent = posted(calls, "/messages");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe(`/api/surveys/requests/${ID}/messages`);
    expect(bodyOf(sent[0])).toEqual({ body: "Still broken" });
    await waitFor(() => expect(threadLoads).toBe(2));
  });

  test("a failed send shows a banner and keeps the draft", async () => {
    fakeFetch(routes());
    const posts = failPost("/messages");
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    const box = (await screen.findByLabelText("Message")) as HTMLTextAreaElement;
    await user.type(box, "Still broken");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/could not send/i)).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(box.value).toBe("Still broken");
    expect(posts).toHaveLength(1);
  });

  test("Send is disabled while the message is empty", async () => {
    fakeFetch(routes());
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    const send = await screen.findByRole("button", { name: "Send" });
    expect(send.hasAttribute("disabled") || send.getAttribute("data-disabled") !== null).toBe(true);
  });

  test("the owner can mark it solved but not decline; the agency can do both", async () => {
    fakeFetch(routes());
    const owner = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(owner.user);
    expect(await screen.findByRole("button", { name: "Mark as solved" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
    owner.unmount();
    fakeFetch(routes());
    const am = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(am.user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Mark as solved" })).toBeTruthy();
  });

  test("declining posts the status and the closing message", async () => {
    const calls = fakeFetch({ ...routes(), [`/api/surveys/requests/${ID}/close`]: { ok: true } });
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(user);
    await user.type(await screen.findByLabelText("Message"), "Out of scope");
    await user.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(posted(calls, "/close")).toHaveLength(1));
    expect(bodyOf(posted(calls, "/close")[0])).toEqual({
      to: "dismissed",
      message: "Out of scope",
    });
  });

  test("declining without a message sends only the status", async () => {
    const calls = fakeFetch({ ...routes(), [`/api/surveys/requests/${ID}/close`]: { ok: true } });
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(user);
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() => expect(posted(calls, "/close")).toHaveLength(1));
    expect(bodyOf(posted(calls, "/close")[0])).toEqual({ to: "dismissed" });
  });

  test("a failed close shows a banner and keeps the draft", async () => {
    fakeFetch(routes());
    failPost("/close");
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(user);
    const box = (await screen.findByLabelText("Message")) as HTMLTextAreaElement;
    await user.type(box, "Out of scope");
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText(/could not close it/i)).toBeTruthy();
    expect(box.value).toBe("Out of scope");
  });

  test("a read-only viewer sees the thread without composer or close buttons", async () => {
    fakeFetch(routes());
    const { user } = asAm(<HelpThreads canDecline canWrite={false} pollMs={60_000} />);
    await open(user);
    await screen.findByRole("region", { name: "Conversation" });
    await screen.findByText("Help", { selector: "p.whitespace-pre-wrap" });
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as solved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });

  test("a closed request shows its status and still takes messages", async () => {
    const calls = fakeFetch({
      ...routes(base({ status: "fulfilled", awaiting: null })),
      [`/api/surveys/requests/${ID}/messages`]: { id: "m9" },
    });
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    const list = await screen.findByRole("list", { name: "Help requests" });
    expect(within(list).getByText("Solved")).toBeTruthy();
    await user.click(within(list).getByText("Bellaire"));
    const box = await screen.findByLabelText("Message");
    expect(screen.queryByRole("button", { name: "Mark as solved" })).toBeNull();
    await user.type(box, "One more thing");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(posted(calls, "/messages")).toHaveLength(1));
  });

  test("a declined request is labelled Declined", async () => {
    fakeFetch(routes(base({ status: "dismissed", awaiting: null })));
    asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    const list = await screen.findByRole("list", { name: "Help requests" });
    expect(within(list).getByText("Declined")).toBeTruthy();
  });

  test("an external review needs an https link and posts as an attachment", async () => {
    const calls = fakeFetch({
      ...routes(),
      [`/api/surveys/requests/${ID}/messages`]: { id: "m9" },
    });
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    await user.type(await screen.findByLabelText("Message"), "Look at this");
    await user.click(screen.getByRole("button", { name: "Attach" }));
    await user.click(screen.getByRole("button", { name: "External review" }));

    await user.type(screen.getByLabelText(/review link/i), "http://maps.google.com/?cid=1");
    await user.click(screen.getByRole("button", { name: "Add review" }));
    expect(await screen.findByText("Use the https link of the review.")).toBeTruthy();
    expect(posted(calls, "/messages")).toHaveLength(0);

    const url = screen.getByLabelText(/review link/i);
    await user.clear(url);
    await user.type(url, "https://maps.google.com/?cid=1");
    await user.type(screen.getByLabelText(/review text/i), "Unfair");
    await user.click(screen.getByRole("button", { name: "Add review" }));
    expect(await screen.findByRole("button", { name: "Remove attachment" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(posted(calls, "/messages")).toHaveLength(1));
    expect(bodyOf(posted(calls, "/messages")[0])).toEqual({
      body: "Look at this",
      attachment: { kind: "review", url: "https://maps.google.com/?cid=1", text: "Unfair" },
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove attachment" })).toBeNull(),
    );
  });

  async function stageReview(user: ReturnType<typeof setup>["user"], draft: string) {
    await open(user);
    if (draft) await user.type(await screen.findByLabelText("Message"), draft);
    else await screen.findByLabelText("Message");
    await user.click(screen.getByRole("button", { name: "Attach" }));
    await user.click(screen.getByRole("button", { name: "External review" }));
    await user.type(screen.getByLabelText(/review link/i), "https://maps.google.com/?cid=1");
    await user.click(screen.getByRole("button", { name: "Add review" }));
    await screen.findByRole("button", { name: "Remove attachment" });
  }

  test("closing with a staged attachment posts the message first, then closes without a message", async () => {
    const calls = fakeFetch({
      ...routes(),
      [`/api/surveys/requests/${ID}/messages`]: { id: "m9" },
      [`/api/surveys/requests/${ID}/close`]: { ok: true },
    });
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await stageReview(user, "Fixed it");
    await user.click(screen.getByRole("button", { name: "Mark as solved" }));
    await waitFor(() => expect(posted(calls, "/close")).toHaveLength(1));
    const writes = calls.filter((c) => c.init?.method === "POST");
    expect(writes.map((c) => c.path.split("/").pop())).toEqual(["messages", "close"]);
    expect(bodyOf(writes[0])).toEqual({
      body: "Fixed it",
      attachment: { kind: "review", url: "https://maps.google.com/?cid=1" },
    });
    expect(bodyOf(writes[1])).toEqual({ to: "fulfilled" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove attachment" })).toBeNull(),
    );
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
  });

  test("closing with a staged attachment and no message sends nothing", async () => {
    const calls = fakeFetch({
      ...routes(),
      [`/api/surveys/requests/${ID}/messages`]: { id: "m9" },
      [`/api/surveys/requests/${ID}/close`]: { ok: true },
    });
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await stageReview(user, "");
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Add a message to go with the attachment.")).toBeTruthy();
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Remove attachment" })).toBeTruthy();
  });

  test("a failed close after the post does not post the message twice on retry", async () => {
    const calls = fakeFetch({
      ...routes(),
      [`/api/surveys/requests/${ID}/messages`]: { id: "m9" },
      [`/api/surveys/requests/${ID}/close`]: { ok: true },
    });
    const ok = globalThis.fetch;
    let failClose = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      failClose && String(input).endsWith("/close") && init?.method === "POST"
        ? new Response("{}", { status: 500 })
        : ok(input, init)) as typeof fetch;
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await stageReview(user, "Fixed it");
    await user.click(screen.getByRole("button", { name: "Mark as solved" }));
    expect(await screen.findByText(/could not close it/i)).toBeTruthy();
    expect(posted(calls, "/messages")).toHaveLength(1);
    failClose = false;
    await user.click(screen.getByRole("button", { name: "Mark as solved" }));
    await waitFor(() => expect(posted(calls, "/close")).toHaveLength(1));
    expect(posted(calls, "/messages")).toHaveLength(1);
    expect(bodyOf(posted(calls, "/close")[0])).toEqual({ to: "fulfilled" });
  });

  test("a survey response is picked from the list and posts by id", async () => {
    const calls = fakeFetch({
      ...routes(),
      [`/api/surveys/responses/pickable?requestId=${ID}`]: {
        responses: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            createdAt: new Date().toISOString(),
            rating: 2,
            excerpt: "Cold food and slow",
            locationId: "l1",
            locationName: "Bellaire",
          },
        ],
      },
      [`/api/surveys/requests/${ID}/messages`]: { id: "m9" },
    });
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    await user.type(await screen.findByLabelText("Message"), "This one");
    await user.click(screen.getByRole("button", { name: "Attach" }));
    await user.click(screen.getByRole("button", { name: "Survey response" }));
    const choices = await screen.findByRole("list", { name: "Survey responses" });
    expect(within(choices).getByText(/Bellaire/)).toBeTruthy();
    await user.click(within(choices).getByText(/cold food and slow/i));
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(posted(calls, "/messages")).toHaveLength(1));
    expect(bodyOf(posted(calls, "/messages")[0])).toEqual({
      body: "This one",
      attachment: { kind: "response", responseId: "22222222-2222-4222-8222-222222222222" },
    });
  });

  test("a response that is not available for the client gets its own message", async () => {
    fakeFetch({
      ...routes(),
      [`/api/surveys/responses/pickable?requestId=${ID}`]: {
        responses: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            createdAt: new Date().toISOString(),
            rating: 2,
            excerpt: "Cold food and slow",
            locationId: "l1",
            locationName: "Bellaire",
          },
        ],
      },
    });
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/messages") && init?.method === "POST"
        ? new Response(JSON.stringify({ error: "attachment_not_found" }), { status: 422 })
        : inner(input, init)) as typeof fetch;
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(user);
    await user.type(await screen.findByLabelText("Message"), "This one");
    await user.click(screen.getByRole("button", { name: "Attach" }));
    await user.click(screen.getByRole("button", { name: "Survey response" }));
    const choices = await screen.findByRole("list", { name: "Survey responses" });
    await user.click(within(choices).getByText(/cold food and slow/i));
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("That response is not available for this client.")).toBeTruthy();
    expect(screen.queryByText("We could not send that. Try again.")).toBeNull();
  });

  test("an empty list says so, differently for the client", async () => {
    fakeFetch({ "/api/surveys/requests": { requests: [] } });
    const owner = asOwner(<HelpThreads canDecline={false} pollMs={60_000} />);
    expect(await screen.findByText("No help requests")).toBeTruthy();
    expect(screen.getByText(/ask for help from the help page/i)).toBeTruthy();
    owner.unmount();
    asAm(<HelpThreads canDecline pollMs={60_000} />);
    expect(await screen.findByText("No help requests")).toBeTruthy();
    expect(screen.queryByText(/ask for help from the help page/i)).toBeNull();
  });

  test("a list that fails to load offers a retry", async () => {
    fakeFetch({});
    const { user } = asOwner(<HelpThreads canDecline={false} pollMs={60_000} />);
    expect(await screen.findByText("Could not load help requests")).toBeTruthy();
    fakeFetch(routes());
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Bellaire")).toBeTruthy();
  });

  test("an open thread is polled, and the poll pauses while the tab is hidden", async () => {
    let threadLoads = 0;
    const r = routes();
    fakeFetch({
      ...r,
      [`/api/surveys/requests/${ID}`]: () => {
        threadLoads += 1;
        return r[`/api/surveys/requests/${ID}`];
      },
    });
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={25} />);
    await open(user);
    await waitFor(() => expect(threadLoads).toBeGreaterThanOrEqual(3));

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    try {
      await new Promise((r2) => setTimeout(r2, 60)); // let an in-flight tick settle
      const frozen = threadLoads;
      await new Promise((r2) => setTimeout(r2, 150));
      expect(threadLoads).toBe(frozen);
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState;
    }
    await waitFor(() => expect(threadLoads).toBeGreaterThan(0));
    const resumed = threadLoads;
    await waitFor(() => expect(threadLoads).toBeGreaterThan(resumed));
  });
});

describe("accessibility and labels", () => {
  const attachButton = () => screen.getByRole("button", { name: "Attach" });

  test("Attach is a disclosure: it moves focus in, and Escape closes it and returns focus", async () => {
    fakeFetch(routes());
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    await screen.findByLabelText("Message");
    expect(attachButton().getAttribute("aria-expanded")).toBe("false");
    expect(attachButton().getAttribute("aria-haspopup")).toBeNull();
    await user.click(attachButton());
    expect(attachButton().getAttribute("aria-expanded")).toBe("true");
    const panelId = attachButton().getAttribute("aria-controls") as string;
    expect(document.getElementById(panelId)).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    const first = screen.getByRole("button", { name: "External review" });
    expect(screen.getByRole("button", { name: "Survey response" })).toBeTruthy();
    expect(document.activeElement).toBe(first);
    await user.keyboard("{Escape}");
    expect(attachButton().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "External review" })).toBeNull();
    expect(document.activeElement).toBe(attachButton());
  });

  test("a click outside closes the Attach disclosure and returns focus to the button", async () => {
    fakeFetch(routes());
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(user);
    await screen.findByLabelText("Message");
    await user.click(attachButton());
    await user.click(document.body);
    expect(attachButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(attachButton());
    // Toggling with the button itself also works.
    await user.click(attachButton());
    expect(attachButton().getAttribute("aria-expanded")).toBe("true");
    await user.click(attachButton());
    expect(attachButton().getAttribute("aria-expanded")).toBe("false");
  });

  test("selecting a request scrolls to the conversation and focuses its heading", async () => {
    const scrolled: unknown[] = [];
    const proto = Element.prototype as { scrollIntoView?: (o?: unknown) => void };
    const before = proto.scrollIntoView;
    proto.scrollIntoView = (o) => void scrolled.push(o);
    try {
      fakeFetch(routes());
      const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
      await open(user);
      const heading = await screen.findByRole("heading", { name: /Bellaire/ });
      expect(heading.getAttribute("tabindex")).toBe("-1");
      await waitFor(() => expect(document.activeElement).toBe(heading));
      expect(scrolled).toEqual([{ block: "start" }]);
    } finally {
      if (before) proto.scrollIntoView = before;
      else delete proto.scrollIntoView;
    }
  });

  test("the selected row is aria-current, the others carry no attribute", async () => {
    fakeFetch(routes());
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    const list = await screen.findByRole("list", { name: "Help requests" });
    const row = within(list).getByRole("button");
    expect(row.getAttribute("aria-current")).toBeNull();
    await user.click(row);
    expect(row.getAttribute("aria-current")).toBe("true");
  });

  test("the remove-attachment target is at least 24px", async () => {
    fakeFetch(routes());
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(user);
    await screen.findByLabelText("Message");
    await user.click(attachButton());
    await user.click(screen.getByRole("button", { name: "External review" }));
    await user.type(screen.getByLabelText(/review link/i), "https://maps.google.com/?cid=1");
    await user.click(screen.getByRole("button", { name: "Add review" }));
    const remove = await screen.findByRole("button", { name: "Remove attachment" });
    expect(remove.className).toContain("min-h-6");
    expect(remove.className).toContain("min-w-6");
  });

  test("only your own messages say You; a colleague on your side is named with the side", async () => {
    const colleague = { ...msg("m2", "client", "Me too"), authorName: "Pat Partner" };
    fakeFetch(routes(base(), [msg("m1", "client", "Help"), colleague]));
    const owner = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await open(owner.user);
    const convo = await screen.findByRole("region", { name: "Conversation" });
    await within(convo).findByText("Pat Partner");
    expect(within(convo).getAllByText("You")).toHaveLength(1);
    expect(within(convo).getByText("The client")).toBeTruthy();
    owner.unmount();

    const mate = { ...msg("m3", "agency", "Looking"), authorName: "Sam Support" };
    fakeFetch(routes(base(), [msg("m1", "client", "Help"), mate]));
    const am = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await open(am.user);
    const convo2 = await screen.findByRole("region", { name: "Conversation" });
    await within(convo2).findByText("Sam Support");
    expect(within(convo2).queryByText("You")).toBeNull();
    expect(within(convo2).getByText("Atrium team")).toBeTruthy();
    expect(within(convo2).getByText("The client")).toBeTruthy();
  });
});
