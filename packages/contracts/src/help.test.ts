import { describe, expect, test } from "bun:test";
import { HelpAttachment, HelpCloseInput, HelpMessageInput, HelpRequestInput } from "./help";

const id = "7e4a0c32-9f5d-4b88-8c43-1b2c3d4e5f66";

describe("help attachments", () => {
  test("accepts a response id and an https review", () => {
    expect(HelpAttachment.safeParse({ kind: "response", responseId: id }).success).toBe(true);
    expect(
      HelpAttachment.safeParse({
        kind: "review",
        url: "https://maps.google.com/?cid=1",
        rating: 1,
        text: "Awful <script>alert(1)</script>",
      }).success,
    ).toBe(true);
  });

  test("rejects a non-https link, a javascript link and an over-long url", () => {
    for (const url of [
      "http://example.com/r",
      "javascript:alert(1)",
      "ftp://x.test/r",
      "not a url",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      expect(HelpAttachment.safeParse({ kind: "review", url }).success).toBe(false);
    }
  });

  test("normalises the review link: uppercase scheme, padding and whitespace-only text", () => {
    const parsed = HelpAttachment.parse({
      kind: "review",
      url: "  HTTPS://Maps.Google.com/?cid=1  ",
      text: "   ",
    });
    expect(parsed).toEqual({ kind: "review", url: "https://maps.google.com/?cid=1" });
    expect("text" in parsed && parsed.text).toBeFalsy();
    expect(HelpAttachment.parse({ kind: "review", url: "HTTPS://x.test" })).toEqual({
      kind: "review",
      url: "https://x.test/",
    });
    expect(HelpAttachment.safeParse({ kind: "review", url: " javascript:alert(1) " }).success).toBe(
      false,
    );
  });

  test("rejects a bad rating, long text, extra keys and a malformed response id", () => {
    const url = "https://example.com/r";
    expect(HelpAttachment.safeParse({ kind: "review", url, rating: 6 }).success).toBe(false);
    expect(HelpAttachment.safeParse({ kind: "review", url, text: "x".repeat(1001) }).success).toBe(
      false,
    );
    expect(HelpAttachment.safeParse({ kind: "review", url, extra: 1 }).success).toBe(false);
    expect(HelpAttachment.safeParse({ kind: "response", responseId: "nope" }).success).toBe(false);
    expect(HelpAttachment.safeParse({ kind: "file", url }).success).toBe(false);
  });
});

describe("help inputs", () => {
  test("a message needs a non-empty body of at most 2000 characters", () => {
    expect(HelpMessageInput.safeParse({ body: "Hello" }).success).toBe(true);
    expect(HelpMessageInput.safeParse({ body: "   " }).success).toBe(false);
    expect(HelpMessageInput.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
    expect(HelpMessageInput.safeParse({ body: "Hi", extra: true }).success).toBe(false);
  });

  test("a close is fulfilled or dismissed with an optional message", () => {
    expect(HelpCloseInput.safeParse({ to: "fulfilled" }).success).toBe(true);
    expect(HelpCloseInput.safeParse({ to: "dismissed", message: "Not possible" }).success).toBe(
      true,
    );
    expect(HelpCloseInput.safeParse({ to: "open" }).success).toBe(false);
    expect(HelpCloseInput.parse({ to: "fulfilled", message: "" }).message).toBeUndefined();
    expect(HelpCloseInput.parse({ to: "fulfilled", message: "  " }).message).toBeUndefined();
    expect(HelpCloseInput.parse({ to: "fulfilled", message: " Done " }).message).toBe("Done");
  });

  test("a new request needs a place and a note", () => {
    expect(HelpRequestInput.safeParse({ locationId: id, note: "Please help" }).success).toBe(true);
    expect(HelpRequestInput.safeParse({ locationId: id, note: "" }).success).toBe(false);
    expect(HelpRequestInput.safeParse({ locationId: "x", note: "Hi" }).success).toBe(false);
  });
});
