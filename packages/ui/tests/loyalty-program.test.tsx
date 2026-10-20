import { afterEach, describe, expect, test } from "bun:test";
import { ApiError, type LoyaltyProgram } from "../src/api";
import { LoyaltyPrintPage, LoyaltyProgramPage, loyaltyFailure, POSTER_COPY } from "../src/loyalty";
import { MeProvider } from "../src/shell/app-frame";
import { meOf, restoreFetch } from "./fake-api";
import { screen, setup, waitFor } from "./helpers";

type Reply = { status?: number; body: unknown };
type Call = { path: string; method: string; body: string | null };

/** Answers fetch by "METHOD path". A missing route is a 404. Returns what was asked. */
function routed(routes: Record<string, Reply | (() => Reply)>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    calls.push({ path, method, body: typeof init?.body === "string" ? init.body : null });
    const hit = routes[`${method} ${path}`];
    if (hit === undefined) return new Response("{}", { status: 404 });
    const reply = typeof hit === "function" ? hit() : hit;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

afterEach(restoreFetch);

const LOC = "7f9c24e8-3b1a-4c55-9d52-0b8f6a1c2d3e";
const place = (id: string, name: string) => ({
  id,
  name,
  clientId: "c",
  clientName: "Olivo",
  status: "active",
});
const PLACES: Reply = { body: { locations: [place(LOC, "Casa Olivo")] } };
const PROGRAM_GET = `GET /api/loyalty/program?locationId=${LOC}`;
const LINK_GET = `GET /api/loyalty/program/join-link?locationId=${LOC}`;
const JOIN_URL = "https://card.example.com/j/abc123";
const LINK: Reply = { body: { url: JOIN_URL, token: "abc123" } };

const program: LoyaltyProgram = {
  id: "pg1",
  locationId: LOC,
  name: "Coffee card",
  stampsRequired: 6,
  rewardLabel: "A free coffee",
  cooldownMinutes: 60,
  active: true,
  accent: "sage",
  joinQrVersion: 1,
};

const owner = meOf({ canReadLoyalty: true, canManageLoyalty: true });
const staff = meOf({ canReadLoyalty: true, canStampLoyalty: true, kind: "client" });

function page(me = owner) {
  return setup(
    <MeProvider me={me}>
      <LoyaltyProgramPage />
    </MeProvider>,
  );
}

describe("loyalty program page", () => {
  test("a place with no program starts from the defaults", async () => {
    routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program: null } },
      [LINK_GET]: LINK,
    });
    page();
    expect(((await screen.findByLabelText("Stamps needed")) as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText("Cooldown (minutes)") as HTMLInputElement).value).toBe("240");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Loyalty card");
    expect(screen.getByRole("radio", { name: "Lime" }).getAttribute("aria-checked")).toBe("true");
  });

  test("the owner saves: PUT carries the place and exactly the six fields", async () => {
    const calls = routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program: null } },
      [LINK_GET]: LINK,
      "PUT /api/loyalty/program": { body: { program } },
    });
    const { user } = page();
    await screen.findByLabelText("Stamps needed");
    await user.type(screen.getByLabelText("Reward"), "A free coffee");
    await user.click(screen.getByRole("button", { name: "Save program" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT");
    const sent = JSON.parse(put?.body ?? "{}");
    expect(Object.keys(sent).sort()).toEqual([
      "accent",
      "active",
      "cooldownMinutes",
      "locationId",
      "name",
      "rewardLabel",
      "stampsRequired",
    ]);
    expect(sent.locationId).toBe(LOC);
    expect(sent.rewardLabel).toBe("A free coffee");
    expect(sent.stampsRequired).toBe(8);
    expect(await screen.findByText("Program saved.")).toBeTruthy();
  });

  test("an empty reward is refused on the client, with no request", async () => {
    const calls = routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program: null } },
      [LINK_GET]: LINK,
    });
    const { user } = page();
    await screen.findByLabelText("Stamps needed");
    await user.click(screen.getByRole("button", { name: "Save program" }));
    expect(await screen.findByText("Give the reward a name (1 to 80 characters).")).toBeTruthy();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  test("a 422 shows the API message", async () => {
    routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program } },
      [LINK_GET]: LINK,
      "PUT /api/loyalty/program": {
        status: 422,
        body: { error: "invalid", message: "rewardLabel: 1 to 80 characters" },
      },
    });
    const { user } = page();
    await screen.findByDisplayValue("Coffee card");
    await user.click(screen.getByRole("button", { name: "Save program" }));
    expect(await screen.findByText("rewardLabel: 1 to 80 characters")).toBeTruthy();
  });

  test("staff sees the program read-only and no join QR", async () => {
    routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program } },
      [LINK_GET]: LINK,
    });
    page(staff);
    const name = (await screen.findByDisplayValue("Coffee card")) as HTMLInputElement;
    expect(name.disabled).toBe(true);
    expect(
      screen.getByText("Only the owner or the Atrium team can change the program."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save program" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rotate QR" })).toBeNull();
    expect(document.querySelector("svg[role='img'][aria-label]")).toBeNull();
  });

  test("the preview follows the form: 10 stamps in clay", async () => {
    routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program } },
      [LINK_GET]: LINK,
    });
    const { user } = page();
    const stamps = (await screen.findByLabelText("Stamps needed")) as HTMLInputElement;
    expect(document.querySelectorAll("[data-stamp]")).toHaveLength(6);
    await user.clear(stamps);
    await user.type(stamps, "10");
    await user.tab();
    await user.click(screen.getByRole("radio", { name: "Clay" }));
    await waitFor(() => expect(document.querySelectorAll("[data-stamp]")).toHaveLength(10));
    expect(document.querySelectorAll('[data-stamp="filled"].bg-clay-500').length).toBeGreaterThan(
      0,
    );
  });

  test("the join panel draws the QR, offers print links, and Rotate asks first then refetches", async () => {
    let links = 0;
    const calls = routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program } },
      [LINK_GET]: () => {
        links += 1;
        return links === 1
          ? LINK
          : { body: { url: "https://card.example.com/j/zzz999", token: "zzz999" } };
      },
      "POST /api/loyalty/program/rotate-qr": {
        body: { program: { ...program, joinQrVersion: 2 } },
      },
    });
    const { user } = page();
    const poster = await screen.findByRole("link", { name: "Print poster" });
    expect(poster.getAttribute("href")).toBe(`/print/loyalty?locationId=${LOC}&format=poster`);
    expect(poster.getAttribute("target")).toBe("_blank");
    expect(poster.getAttribute("rel")).toBe("noreferrer");
    expect(screen.getByRole("link", { name: "Print table cards" }).getAttribute("href")).toBe(
      `/print/loyalty?locationId=${LOC}&format=cards`,
    );
    const qr = document.querySelector("svg[width='160']");
    expect(qr).toBeTruthy();
    const before = qr?.innerHTML;

    await user.click(screen.getByRole("button", { name: "Rotate QR" }));
    expect(
      await screen.findByText(
        "Every printed join QR stops working. Cards already issued keep working.",
      ),
    ).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    const confirm = screen
      .getAllByRole("button", { name: "Rotate QR" })
      .find((b) => b.closest("[role='alertdialog']"));
    expect(confirm).toBeTruthy();
    await user.click(confirm as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    await waitFor(() => expect(links).toBe(2));
    await waitFor(() =>
      expect(document.querySelector("svg[width='160']")?.innerHTML).not.toBe(before),
    );
  });

  test("a null join url warns that QR_CARD_URL is not set", async () => {
    routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program } },
      [LINK_GET]: { body: { url: null, token: "abc123" } },
    });
    page();
    expect(await screen.findByText("QR_CARD_URL is not set on the server.")).toBeTruthy();
    expect(document.querySelector("svg[width='160']")).toBeNull();
  });

  test("403 feature_locked shows the locked Retention page", async () => {
    routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { status: 403, body: { error: "feature_locked" } },
      "GET /api/access": { body: { access: { retention: "locked" } } },
    });
    page(meOf({ kind: "client", canReadLoyalty: true, canManageLoyalty: true }));
    expect(await screen.findByText("Not in your plan yet.")).toBeTruthy();
  });

  test("a parent re-render neither refetches the program nor resets a typed edit", async () => {
    const calls = routed({
      "GET /api/locations": PLACES,
      [PROGRAM_GET]: { body: { program } },
      [LINK_GET]: LINK,
    });
    const { user, rerender } = page();
    const name = (await screen.findByDisplayValue("Coffee card")) as HTMLInputElement;
    await user.clear(name);
    await user.type(name, "Brunch card");
    rerender(
      <MeProvider me={{ ...owner }}>
        <LoyaltyProgramPage />
      </MeProvider>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Brunch card");
    expect(calls.filter((c) => c.path === `/api/loyalty/program?locationId=${LOC}`)).toHaveLength(
      1,
    );
  });

  test("with two places the selector writes ?place= and loads that place", async () => {
    const other = "11111111-2222-4333-8444-555555555555";
    const calls = routed({
      "GET /api/locations": {
        body: { locations: [place(LOC, "Casa Olivo"), place(other, "Patio")] },
      },
      [`GET /api/loyalty/program?locationId=${other}`]: { body: { program: null } },
      [`GET /api/loyalty/program/join-link?locationId=${other}`]: LINK,
    });
    window.history.replaceState(null, "", `/loyalty/program?place=${other}`);
    try {
      page();
      expect(await screen.findByLabelText("Stamps needed")).toBeTruthy();
      expect(calls.some((c) => c.path.includes(`locationId=${other}`))).toBe(true);
      expect(calls.some((c) => c.path.includes(`locationId=${LOC}`))).toBe(false);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});

describe("loyaltyFailure", () => {
  test("maps 403 feature_locked, other 403 and the rest", () => {
    expect(loyaltyFailure(new ApiError(403, "feature_locked"))).toBe("locked");
    expect(loyaltyFailure(new ApiError(403, "forbidden"))).toBe("forbidden");
    expect(loyaltyFailure(new ApiError(500, "error"))).toBe("error");
    expect(loyaltyFailure(new Error("x"))).toBe("error");
  });
});

describe("loyalty print page", () => {
  const printRoutes = {
    "GET /api/locations": PLACES,
    [PROGRAM_GET]: { body: { program } },
    [LINK_GET]: LINK,
  };

  test("poster has one QR, cards has four, lang es uses the Spanish poster copy", async () => {
    routed(printRoutes);
    const poster = setup(<LoyaltyPrintPage locationId={LOC} format="poster" lang="en" />);
    expect(await screen.findByText("Collect stamps at Casa Olivo")).toBeTruthy();
    expect(document.querySelectorAll("svg[role='img']")).toHaveLength(1);
    expect(
      [...document.querySelectorAll("style")].some((el) =>
        el.textContent?.includes("@page { size: A4 portrait; margin: 12mm }"),
      ),
    ).toBe(true);
    expect(screen.getByText("Scan with your phone camera. No app, no sign-up.")).toBeTruthy();
    expect(document.body.textContent).toContain("A free coffee");
    expect(document.body.textContent).not.toContain("Coffee card");
    expect(document.body.textContent).not.toContain("abc123?");
    poster.unmount();

    const cards = setup(<LoyaltyPrintPage locationId={LOC} format="cards" lang="en" />);
    await waitFor(() => expect(document.querySelectorAll("svg[role='img']")).toHaveLength(4));
    cards.unmount();

    setup(<LoyaltyPrintPage locationId={LOC} format="poster" lang="es" />);
    expect(await screen.findByText("Colecciona sellos en Casa Olivo")).toBeTruthy();
    expect(
      screen.getByText("Escanea con la cámara del móvil. Sin app, sin registro."),
    ).toBeTruthy();
    expect(POSTER_COPY.es.title).toBe("Colecciona sellos en {venue}");
  });

  test("a 401 asks to sign in to the Platform first", async () => {
    routed({ "GET /api/locations": { status: 401, body: { error: "unauthorized" } } });
    setup(<LoyaltyPrintPage locationId={LOC} format="poster" lang="en" />);
    expect(await screen.findByText("Sign in to the Platform first.")).toBeTruthy();
  });

  test("a forbidden answer shows the same title and body as on screen", async () => {
    routed({ ...printRoutes, [PROGRAM_GET]: { status: 403, body: { error: "forbidden" } } });
    setup(<LoyaltyPrintPage locationId={LOC} format="poster" lang="en" />);
    expect(await screen.findByText("Not available for your role")).toBeTruthy();
    expect(
      screen.getByText("Ask the account owner or the Atrium team if you need this."),
    ).toBeTruthy();
  });

  test("a locked answer says so, a null url warns", async () => {
    routed({ ...printRoutes, [PROGRAM_GET]: { status: 403, body: { error: "feature_locked" } } });
    const first = setup(<LoyaltyPrintPage locationId={LOC} format="poster" lang="en" />);
    expect(await screen.findByText("Not in your plan yet.")).toBeTruthy();
    first.unmount();
    routed({ ...printRoutes, [LINK_GET]: { body: { url: null, token: "t" } } });
    setup(<LoyaltyPrintPage locationId={LOC} format="poster" lang="en" />);
    expect(await screen.findByText("QR_CARD_URL is not set on the server.")).toBeTruthy();
  });
});
