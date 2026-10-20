import { describe, expect, mock, test } from "bun:test";
import {
  ACCENT_STYLE,
  CARD_COPY,
  fill,
  LOYALTY_ACCENTS,
  LoyaltyCardScreen,
  type LoyaltyCardView,
} from "../src/loyalty";
import { screen, setup, waitFor } from "./helpers";

const view: LoyaltyCardView = {
  state: "active",
  locationName: "Casa Olivo",
  programName: "Coffee card",
  rewardLabel: "A free coffee",
  accent: "clay",
  stampsRequired: 8,
  stampsInCycle: 3,
  rewardReady: false,
  shortCode: "ABCD-EFGH",
  etag: "e",
};
const ok = async () => "ok" as const;
const noop = () => {};
const base = {
  status: "live" as const,
  view,
  copy: CARD_COPY.en,
  onEmail: ok,
  emailDone: false,
  showHint: true,
  onDismissHint: noop,
};

describe("accent and copy tables", () => {
  test("four accents with fixed classes", () => {
    expect(LOYALTY_ACCENTS).toEqual(["lime", "clay", "charcoal", "sage"]);
    expect(ACCENT_STYLE.lime.fill).toBe("bg-lime-500");
    expect(ACCENT_STYLE.sage.label).toBe("Sage");
  });
  test("fill and both locales share keys", () => {
    expect(fill("{n} of {total}", { n: 3, total: 8 })).toBe("3 of 8");
    expect(Object.keys(CARD_COPY.es).sort()).toEqual(Object.keys(CARD_COPY.en).sort());
  });
});

describe("LoyaltyCardScreen", () => {
  test("an active card: 8 cells, 3 filled in the accent, progress, reward, code, and a QR of the code", () => {
    setup(<LoyaltyCardScreen {...base} />);
    expect(screen.getByRole("img", { name: "3 of 8 stamps" })).toBeTruthy();
    expect(document.querySelectorAll("[data-stamp]")).toHaveLength(8);
    expect(document.querySelectorAll('[data-stamp="filled"].bg-clay-500')).toHaveLength(3);
    expect(screen.getByText("Reward: A free coffee")).toBeTruthy();
    expect(screen.getByText("5 more to your reward")).toBeTruthy();
    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
    expect(document.querySelector("svg[data-card-qr]")).toBeTruthy();
  });

  test("20 stamps are 4 rows of 5", () => {
    setup(<LoyaltyCardScreen {...base} view={{ ...view, stampsRequired: 20, stampsInCycle: 2 }} />);
    expect(document.querySelectorAll("[data-stamp]")).toHaveLength(20);
    expect(screen.getByRole("img", { name: "2 of 20 stamps" }).className).toContain("grid-cols-5");
  });

  test("a ready reward shows the lime highlight with the reward and every stamp filled", () => {
    setup(<LoyaltyCardScreen {...base} view={{ ...view, rewardReady: true, stampsInCycle: 8 }} />);
    expect(screen.getByText("Your reward is ready")).toBeTruthy();
    expect(screen.getByText("Show this card to the staff to redeem A free coffee.")).toBeTruthy();
    expect(document.querySelector(".from-lime-500")).toBeTruthy();
    expect(document.querySelectorAll('[data-stamp="filled"]')).toHaveLength(8);
  });

  test("paused and closed show their copy and no email box; not_found shows its copy", () => {
    const { unmount } = setup(<LoyaltyCardScreen {...base} view={{ ...view, state: "paused" }} />);
    expect(screen.getByText("This card is paused")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    unmount();
    const second = setup(<LoyaltyCardScreen {...base} view={{ ...view, state: "closed" }} />);
    expect(screen.getByText("This card is closed")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    second.unmount();
    setup(<LoyaltyCardScreen {...base} status="not_found" view={null} />);
    expect(screen.getByText("We could not find this card")).toBeTruthy();
  });

  test("loading shows the loading copy", () => {
    setup(<LoyaltyCardScreen {...base} status="loading" view={null} />);
    expect(screen.getByText("Loading your card…")).toBeTruthy();
  });

  test("offline keeps the last card and shows the offline line", () => {
    setup(<LoyaltyCardScreen {...base} status="offline" />);
    expect(screen.getByText("No connection. Showing your card as it was.")).toBeTruthy();
    expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
  });

  test("Spanish copy: 3 de 8 sellos", () => {
    setup(<LoyaltyCardScreen {...base} copy={CARD_COPY.es} />);
    expect(screen.getByRole("img", { name: "3 de 8 sellos" })).toBeTruthy();
    expect(screen.getByText("Te faltan 5 para tu premio")).toBeTruthy();
  });

  test("the hint can be dismissed", async () => {
    const onDismissHint = mock();
    const { user } = setup(<LoyaltyCardScreen {...base} onDismissHint={onDismissHint} />);
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDismissHint).toHaveBeenCalled();
  });

  test("the email box: submit is refused until consent is ticked; done replaces the form", async () => {
    const onEmail = mock(async (_email: string) => "ok" as const);
    const { user } = setup(<LoyaltyCardScreen {...base} onEmail={onEmail} />);
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.click(screen.getByRole("button", { name: "Keep me posted" }));
    expect(onEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox").getAttribute("aria-invalid")).toBe("true");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Keep me posted" }));
    expect(onEmail).toHaveBeenCalledWith("guest@example.com");
    await waitFor(() =>
      expect(screen.getByText("Done. We will write to you about your rewards.")).toBeTruthy(),
    );
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(document.body.textContent).not.toContain("guest@example.com");
  });

  test("emailDone from the parent shows the done copy and no form", () => {
    setup(<LoyaltyCardScreen {...base} emailDone />);
    expect(screen.getByText("Done. We will write to you about your rewards.")).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  test("invalid_email and unavailable show their copy and keep the form", async () => {
    for (const [result, text] of [
      ["invalid_email", "Check the email address."],
      ["unavailable", "We could not link it this time."],
    ] as const) {
      const { user, unmount } = setup(<LoyaltyCardScreen {...base} onEmail={async () => result} />);
      await user.type(screen.getByLabelText("Email"), "guest@example.com");
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "Keep me posted" }));
      await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
      expect(screen.getByLabelText("Email")).toBeTruthy();
      unmount();
    }
  });

  test("the announce text is in a polite live region; the animation class is motion-safe only", () => {
    setup(<LoyaltyCardScreen {...base} announce="Stamp added. 3 of 8." animateIndex={2} />);
    const live = screen.getByText("Stamp added. 3 of 8.");
    expect(live.closest("[role=status]")?.getAttribute("aria-live")).toBe("polite");
    const cells = document.querySelectorAll("[data-stamp]");
    expect(cells[2]?.className).toContain("motion-safe:animate-");
    expect(cells[1]?.className).not.toContain("animate-");
  });
});
