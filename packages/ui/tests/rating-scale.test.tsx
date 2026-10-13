import { describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { RATING_EMOJI, RATING_LABEL, RatingScale } from "../src";
import { screen, setup } from "./helpers";

const NAMES: string[] = ["Angry", "Unhappy", "Neutral", "Happy", "Loved it"];

describe("RatingScale", () => {
  test("renders five radios named by their label, none selected for null", () => {
    setup(<RatingScale value={null} onValueChange={() => {}} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label") ?? r.textContent)).toEqual(NAMES);
    for (const n of NAMES) {
      expect(screen.getByRole("radio", { name: n }).getAttribute("aria-checked")).toBe("false");
    }
    expect(screen.getByRole("radiogroup", { name: "Rating" })).toBeTruthy();
  });

  test("exposes the emoji and label constants", () => {
    expect([...RATING_EMOJI]).toEqual(["😠", "🙁", "😐", "🙂", "😍"]);
    expect<string[]>([...RATING_LABEL]).toEqual(NAMES);
  });

  test("clicking an option reports its number", async () => {
    const onValueChange = mock();
    const { user } = setup(<RatingScale value={null} onValueChange={onValueChange} />);
    await user.click(screen.getByRole("radio", { name: "Happy" }));
    expect(onValueChange).toHaveBeenCalledWith(4);
  });

  test("a controlled value checks exactly that option and shows its label", () => {
    setup(<RatingScale value={2} onValueChange={() => {}} aria-label="Visit" />);
    const checked = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked.length).toBe(1);
    expect(checked[0]).toBe(screen.getByRole("radio", { name: "Unhappy" }));
    expect(screen.getByRole("radiogroup", { name: "Visit" })).toBeTruthy();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe("Unhappy");
  });

  test("arrow keys move to and select the neighbour", async () => {
    const seen: (number | null)[] = [];
    function Harness() {
      const [v, setV] = useState<number | null>(3);
      return (
        <RatingScale
          value={v}
          onValueChange={(n) => {
            seen.push(n);
            setV(n);
          }}
        />
      );
    }
    const { user } = setup(<Harness />);
    screen.getByRole("radio", { name: "Neutral" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Happy" }).getAttribute("aria-checked")).toBe("true");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Unhappy" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(seen).toEqual([4, 3, 2]);
  });

  test("the emoji are hidden from the accessibility tree", () => {
    setup(<RatingScale value={null} onValueChange={() => {}} />);
    for (const e of RATING_EMOJI) {
      const el = screen.getByText(e);
      expect(el.closest('[aria-hidden="true"]')).toBeTruthy();
    }
  });
});
