import { describe, expect, test } from "bun:test";
import { awaitingSide, canCloseAs, PREVIEW_MAX, preview } from "../domain/help";

describe("who may close as what", () => {
  test("the client may only mark it solved; the agency may also decline", () => {
    expect(canCloseAs("client", "fulfilled")).toBe(true);
    expect(canCloseAs("client", "dismissed")).toBe(false);
    expect(canCloseAs("agency", "fulfilled")).toBe(true);
    expect(canCloseAs("agency", "dismissed")).toBe(true);
  });
});

describe("whose turn it is", () => {
  test("an open request waits for the side that did not write last", () => {
    expect(awaitingSide("open", "client")).toBe("agency");
    expect(awaitingSide("open", "agency")).toBe("client");
  });
  test("a request nobody has answered yet waits for the agency", () => {
    expect(awaitingSide("open", null)).toBe("agency");
  });
  test("a closed request waits for nobody", () => {
    expect(awaitingSide("fulfilled", "agency")).toBeNull();
    expect(awaitingSide("dismissed", "client")).toBeNull();
  });
});

describe("preview", () => {
  test("keeps short text, collapses whitespace, cuts long text with an ellipsis", () => {
    expect(preview("Hello   there\nfriend")).toBe("Hello there friend");
    const long = "x".repeat(300);
    const cut = preview(long);
    expect(cut.length).toBe(PREVIEW_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(preview("x".repeat(PREVIEW_MAX))).toBe("x".repeat(PREVIEW_MAX));
  });
});
