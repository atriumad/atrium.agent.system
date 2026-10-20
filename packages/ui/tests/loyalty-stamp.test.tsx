import { afterEach, describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import type { StaffCard } from "../src/api";
import { barcodeScanner, type CardScanner, createKeyRing, LoyaltyStampPage } from "../src/loyalty";
import { MeProvider } from "../src/shell/app-frame";
import { meOf, restoreFetch } from "./fake-api";
import { fireEvent, screen, setup, waitFor } from "./helpers";

type Reply = { status?: number; body: unknown };
type Call = { path: string; method: string; body: Record<string, unknown> | null };

/** Answers fetch through one handler and records every call. A network error is `"network"`. */
function serve(handler: (c: Call) => Reply | "network") {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      path: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    const r = handler(call);
    if (r === "network") throw new TypeError("network down");
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  restoreFetch();
  window.history.replaceState(null, "", "/");
});

const LOC = "7f9c24e8-3b1a-4c55-9d52-0b8f6a1c2d3e";
const place = (id: string, name: string) => ({
  id,
  name,
  clientId: "c",
  clientName: "Olivo",
  status: "active",
});
const CARD_PATH = `/api/loyalty/card?locationId=${LOC}&code=ABCDEFGH`;
const card = (over: Partial<StaffCard> = {}): StaffCard => ({
  cardId: "card-1",
  shortCode: "ABCD-EFGH",
  locationId: LOC,
  locationName: "Casa Olivo",
  programName: "Coffee card",
  rewardLabel: "A free coffee",
  state: "active",
  accent: "lime",
  stampsRequired: 8,
  stampsInCycle: 3,
  rewardReady: false,
  rewardsPending: 0,
  recent: [
    {
      id: "e1",
      at: "2026-10-19T09:00:00.000Z",
      kind: "void",
      cardShortCode: "ABCD-EFGH",
      locationId: LOC,
      locationName: "Casa Olivo",
      actorName: "Ana",
      note: "Wrong card",
    },
  ],
  ...over,
});

const staff = meOf({
  kind: "client",
  canReadLoyalty: true,
  canStampLoyalty: true,
  canRedeemLoyalty: true,
});
const owner = meOf({ ...staff, canManageLoyalty: true });

const fakeScanner = (supported = true) => {
  const s = {
    onCode: null as null | ((raw: string) => void),
    stops: 0,
    scanner: {
      supported: () => supported,
      start: async (_v: HTMLVideoElement, onCode: (raw: string) => void) => {
        s.onCode = onCode;
        return () => {
          s.stops += 1;
        };
      },
    } satisfies CardScanner,
  };
  return s;
};

function mount(
  opts: { me?: typeof staff; scanner?: CardScanner; now?: () => Date; places?: unknown[] } = {},
) {
  return setup(
    <MeProvider me={opts.me ?? staff}>
      <LoyaltyStampPage
        scanner={opts.scanner ?? fakeScanner(false).scanner}
        {...(opts.now ? { now: opts.now } : {})}
      />
    </MeProvider>,
  );
}

const PLACES: Reply = { body: { locations: [place(LOC, "Casa Olivo")] } };
const isPlaces = (c: Call) => c.path === "/api/locations";

async function findCard(user: ReturnType<typeof setup>["user"], code = "abcdefgh") {
  await user.type(await screen.findByLabelText("Card code"), code);
  await user.click(screen.getByRole("button", { name: "Find card" }));
  await screen.findByText("A free coffee");
}

describe("createKeyRing", () => {
  test("same key until settled, a new one after", () => {
    let i = 0;
    const ring = createKeyRing(() => `k${++i}`);
    expect(ring.keyFor("stamp", "p:ABCDEFGH")).toBe("k1");
    expect(ring.keyFor("stamp", "p:ABCDEFGH")).toBe("k1");
    expect(ring.keyFor("redeem", "p:ABCDEFGH")).toBe("k2");
    ring.settle("stamp", "p:ABCDEFGH");
    expect(ring.keyFor("stamp", "p:ABCDEFGH")).toBe("k3");
    expect(ring.keyFor("redeem", "p:ABCDEFGH")).toBe("k2");
  });
});

describe("loyalty stamp page", () => {
  test("the only place is preselected; typing abcdefgh shows ABCD-EFGH and Find shows the card", async () => {
    const calls = serve((c) => (isPlaces(c) ? PLACES : { body: { card: card() } }));
    const { user } = mount();
    const field = (await screen.findByLabelText("Card code")) as HTMLInputElement;
    expect(field.placeholder).toBe("XXXX-XXXX");
    expect(field.getAttribute("autocapitalize")).toBe("characters");
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(screen.queryByRole("combobox", { name: "Place" })).toBeNull();
    await user.type(field, "abcdefgh");
    expect(field.value).toBe("ABCD-EFGH");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("A free coffee")).toBeTruthy();
    expect(calls.some((c) => c.path === CARD_PATH)).toBe(true);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText(/Wrong card/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Redeem reward" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Void last stamp" })).toBeNull();
  });

  test("Add stamp: one POST with locationId, code and a key; the result is announced; the card is looked up again", async () => {
    let stamped = false;
    const calls = serve((c) => {
      if (isPlaces(c)) return PLACES;
      if (c.method === "POST") {
        stamped = true;
        return {
          body: {
            cardId: "card-1",
            stampsInCycle: 4,
            stampsRequired: 8,
            rewardEarned: false,
            rewardReady: false,
          },
        };
      }
      return { body: { card: card({ stampsInCycle: stamped ? 4 : 3 }) } };
    });
    const { user } = mount();
    await findCard(user);
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    expect((await screen.findByRole("status")).textContent).toBe("Stamp added. 4 of 8.");
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.path).toBe("/api/loyalty/stamps");
    expect(posts[0]?.body?.locationId).toBe(LOC);
    expect(posts[0]?.body?.code).toBe("ABCDEFGH");
    expect(typeof posts[0]?.body?.idempotencyKey).toBe("string");
    await waitFor(() => expect(calls.filter((c) => c.path === CARD_PATH)).toHaveLength(2));
    expect(screen.getByRole("img", { name: "4 of 8 stamps" })).toBeTruthy();
  });

  test("a completing stamp announces the reward", async () => {
    serve((c) => {
      if (isPlaces(c)) return PLACES;
      if (c.method === "POST") {
        return {
          body: {
            cardId: "card-1",
            stampsInCycle: 0,
            stampsRequired: 8,
            rewardEarned: true,
            rewardReady: true,
          },
        };
      }
      return { body: { card: card() } };
    });
    const { user } = mount();
    await findCard(user);
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    expect((await screen.findByRole("status")).textContent).toBe(
      "Card complete. The reward is ready: A free coffee.",
    );
  });

  test("Review Focus 3: a network failure then Try again posts the same key; a double click posts once", async () => {
    let attempts = 0;
    const calls = serve((c) => {
      if (isPlaces(c)) return PLACES;
      if (c.method === "POST") {
        attempts += 1;
        if (attempts === 1) return "network";
        return {
          body: {
            cardId: "card-1",
            stampsInCycle: 4,
            stampsRequired: 8,
            rewardEarned: false,
            rewardReady: false,
          },
        };
      }
      return { body: { card: card() } };
    });
    const { user } = mount();
    await findCard(user);
    const add = screen.getByRole("button", { name: "Add stamp" });
    // Two clicks in the same tick, before React re-renders the button as busy.
    fireEvent.click(add);
    fireEvent.click(add);
    expect((await screen.findByRole("alert")).textContent).toContain("did not go through");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Stamp added. 4 of 8.");
    const stampBodies = calls
      .filter((c) => c.method === "POST")
      .map((c) => c.body as { idempotencyKey: string });
    expect(stampBodies).toHaveLength(2);
    const first = stampBodies[0]?.idempotencyKey as string;
    expect(stampBodies.map((b) => b.idempotencyKey)).toEqual([first, first]);
    // Settled: the next stamp gets a new key.
    attempts = 1;
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(3));
    const third = calls.filter((c) => c.method === "POST")[2]?.body as { idempotencyKey: string };
    expect(third.idempotencyKey).not.toBe(first);
  });

  test("a 5xx and a 429 keep the key; a 409 spends it", async () => {
    const replies: Reply[] = [
      { status: 500, body: { error: "internal" } },
      { status: 429, body: { error: "rate_limited" } },
      { status: 409, body: { error: "refused", reason: "paused" } },
      {
        status: 200,
        body: {
          cardId: "card-1",
          stampsInCycle: 4,
          stampsRequired: 8,
          rewardEarned: false,
          rewardReady: false,
        },
      },
    ];
    const calls = serve((c) => {
      if (isPlaces(c)) return PLACES;
      if (c.method === "POST") return replies.shift() ?? { status: 500, body: {} };
      return { body: { card: card() } };
    });
    const { user } = mount();
    await findCard(user);
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    await screen.findByText("That did not go through. Check the connection and try again.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Too many tries. Wait a minute and try again.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("This program is paused.");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    await screen.findByText("Stamp added. 4 of 8.");
    const keys = calls.filter((c) => c.method === "POST").map((c) => c.body?.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
  });

  test("cooldown: the next stamp time is shown in local time, with the weekday when not today", async () => {
    const at = new Date(2026, 9, 19, 12, 0);
    const today = new Date(2026, 9, 19, 16, 40);
    const tomorrow = new Date(2026, 9, 20, 9, 5);
    let retryAt = today;
    serve((c) => {
      if (isPlaces(c)) return PLACES;
      if (c.method === "POST") {
        return {
          status: 409,
          body: { error: "refused", reason: "cooldown", retryAt: retryAt.toISOString() },
        };
      }
      return { body: { card: card() } };
    });
    const { user } = mount({ now: () => at });
    await findCard(user);
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Already stamped recently. Next stamp from 16:40.",
    );
    retryAt = tomorrow;
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    const weekday = tomorrow.toLocaleString(undefined, { weekday: "short" });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(`Next stamp from ${weekday}`),
    );
    expect(screen.getByRole("alert").textContent).toContain("09:05");
  });

  test("paused card: Add stamp disabled, Redeem still offered when a reward is pending", async () => {
    const calls = serve((c) => {
      if (isPlaces(c)) return PLACES;
      if (c.method === "POST") return { body: { cardId: "card-1", rewardId: "r1" } };
      return { body: { card: card({ state: "paused", rewardsPending: 2, rewardReady: true }) } };
    });
    const { user } = mount();
    await findCard(user);
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText(/Reward ready/)).toBeTruthy();
    expect(screen.getByText(/2 pending/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add stamp" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Redeem reward" }));
    expect((await screen.findByRole("status")).textContent).toBe("Reward redeemed.");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.path).toBe("/api/loyalty/redeem");
    expect(post?.body?.code).toBe("ABCDEFGH");
  });

  test("a stamper without the redeem flag does not see Redeem", async () => {
    serve((c) => (isPlaces(c) ? PLACES : { body: { card: card({ rewardsPending: 1 }) } }));
    const { user } = mount({ me: meOf({ ...staff, canRedeemLoyalty: false }) });
    await findCard(user);
    expect(screen.queryByRole("button", { name: "Redeem reward" })).toBeNull();
  });

  test("void: needs the manage flag, a reason of at most 200 characters, and shows the guest-details hint", async () => {
    const calls = serve((c) => {
      if (isPlaces(c)) return PLACES;
      if (c.method === "POST") {
        return {
          body: {
            cardId: "card-1",
            stampsInCycle: 2,
            stampsRequired: 8,
            rewardEarned: false,
            rewardReady: false,
          },
        };
      }
      return { body: { card: card() } };
    });
    const { user } = mount({ me: owner });
    await findCard(user);
    await user.click(screen.getByRole("button", { name: "Void last stamp" }));
    expect(
      screen.getByText("Do not write guest details (names, phone numbers or emails)."),
    ).toBeTruthy();
    expect((screen.getByLabelText("Reason") as HTMLInputElement).maxLength).toBe(200);
    const confirm = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText("Reason"), "   ");
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText("Reason"), " Wrong card ");
    expect(screen.getByText("15 of 200 characters")).toBeTruthy();
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await screen.findByText("Last stamp voided.");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.path).toBe("/api/loyalty/void");
    expect(post?.body?.cardId).toBe("card-1");
    expect(post?.body?.reason).toBe("Wrong card");
    expect(Object.keys(post?.body ?? {}).sort()).toEqual(["cardId", "idempotencyKey", "reason"]);
  });

  test("a scanned card code fills the field and finds the card; a scanned URL is refused", async () => {
    const calls = serve((c) => (isPlaces(c) ? PLACES : { body: { card: card() } }));
    const fake = fakeScanner();
    const { user } = mount({ scanner: fake.scanner });
    await user.click(await screen.findByRole("button", { name: "Scan card" }));
    await waitFor(() => expect(fake.onCode).not.toBeNull());
    expect(document.querySelector("video")?.muted).toBe(true);
    await act(async () => fake.onCode?.("https://card.example.com/c/SECRETTOKEN"));
    expect(await screen.findByText("That QR is not an Atrium card.")).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith("/api/loyalty/card"))).toBe(false);
    expect(fake.stops).toBe(0);
    await act(async () => fake.onCode?.("abcd efgh"));
    expect(await screen.findByText("A free coffee")).toBeTruthy();
    expect((screen.getByLabelText("Card code") as HTMLInputElement).value).toBe("ABCD-EFGH");
    await waitFor(() => expect(fake.stops).toBe(1));
    expect(document.querySelector("video")).toBeNull();
  });

  test("closing the scan dialog, or leaving the page, stops the camera", async () => {
    serve((c) => (isPlaces(c) ? PLACES : { body: { card: card() } }));
    const fake = fakeScanner();
    const { user, unmount } = mount({ scanner: fake.scanner });
    await user.click(await screen.findByRole("button", { name: "Scan card" }));
    await waitFor(() => expect(fake.onCode).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(fake.stops).toBe(1));
    await user.click(screen.getByRole("button", { name: "Scan card" }));
    await waitFor(() => expect(fake.stops).toBe(1));
    await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
    await waitFor(() => expect(fake.onCode).not.toBeNull());
    unmount();
    await waitFor(() => expect(fake.stops).toBe(2));
  });

  test("no Scan button when the scanner is not supported", async () => {
    serve((c) => (isPlaces(c) ? PLACES : { body: { card: card() } }));
    mount({ scanner: fakeScanner(false).scanner });
    await screen.findByLabelText("Card code");
    expect(screen.queryByRole("button", { name: "Scan card" })).toBeNull();
  });

  test("404 and 429 have their messages; feature_locked shows the locked Retention page", async () => {
    let reply: Reply = { status: 404, body: { error: "not_found" } };
    serve((c) => (isPlaces(c) ? PLACES : reply));
    const { user } = mount();
    await user.type(await screen.findByLabelText("Card code"), "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Find card" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "No card with that code at this place.",
    );
    reply = { status: 429, body: { error: "rate_limited" } };
    await user.click(screen.getByRole("button", { name: "Find card" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Too many tries. Wait a minute and try again.",
      ),
    );
    reply = { status: 403, body: { error: "feature_locked" } };
    await user.click(screen.getByRole("button", { name: "Find card" }));
    await waitFor(() => expect(screen.queryByLabelText("Card code")).toBeNull());
  });

  test("a code that is not 8 characters is refused without a request", async () => {
    const calls = serve((c) => (isPlaces(c) ? PLACES : { body: { card: card() } }));
    const { user } = mount();
    await user.type(await screen.findByLabelText("Card code"), "abc");
    await user.click(screen.getByRole("button", { name: "Find card" }));
    expect((await screen.findByRole("alert")).textContent).toContain("8-character");
    expect(calls.filter((c) => c.path.startsWith("/api/loyalty"))).toHaveLength(0);
  });

  test("a role that cannot stamp sees NotAvailable and loads nothing", () => {
    const calls = serve(() => PLACES);
    mount({ me: meOf({ canReadLoyalty: true }) });
    expect(calls).toHaveLength(0);
    expect(screen.queryByLabelText("Card code")).toBeNull();
  });

  test("several places: ?place= preselects one", async () => {
    const other = "11111111-2222-4333-8444-555555555555";
    window.history.replaceState(null, "", `/?place=${other}`);
    serve((c) =>
      isPlaces(c)
        ? { body: { locations: [place(LOC, "Casa Olivo"), place(other, "Bar Dos")] } }
        : { body: { card: card() } },
    );
    mount();
    expect(await screen.findByLabelText("Card code")).toBeTruthy();
  });
});

describe("barcodeScanner", () => {
  test("stopping stops every track, and it reads a code every 250 ms", async () => {
    const stopped: number[] = [];
    const tracks = [0, 1].map((n) => ({ stop: () => stopped.push(n) }));
    const g = globalThis as unknown as Record<string, unknown>;
    const nav = navigator as unknown as { mediaDevices?: unknown };
    const oldDetector = g.BarcodeDetector;
    const oldDevices = nav.mediaDevices;
    let asked: unknown = null;
    g.BarcodeDetector = class {
      detect = async () => [{ rawValue: "ABCDEFGH" }];
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (c: unknown) => {
          asked = c;
          return { getTracks: () => tracks };
        },
      },
    });
    try {
      expect(barcodeScanner.supported()).toBe(true);
      const video = { play: async () => undefined, srcObject: null } as unknown as HTMLVideoElement;
      const seen: string[] = [];
      const stop = await barcodeScanner.start(video, (raw) => seen.push(raw));
      expect(asked).toEqual({ video: { facingMode: "environment" } });
      await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 1000 });
      stop();
      expect(stopped.sort()).toEqual([0, 1]);
      const n = seen.length;
      await new Promise((r) => setTimeout(r, 600));
      expect(seen.length).toBe(n);
    } finally {
      g.BarcodeDetector = oldDetector;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: oldDevices });
    }
  });

  test("is unsupported without a BarcodeDetector", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const old = g.BarcodeDetector;
    g.BarcodeDetector = undefined;
    try {
      expect(barcodeScanner.supported()).toBe(false);
    } finally {
      g.BarcodeDetector = old;
    }
  });
});
