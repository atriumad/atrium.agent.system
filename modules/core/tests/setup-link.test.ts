import { describe, expect, test } from "bun:test";
import { createSetupLinkCapture } from "../application/setup-link";

describe("the set-password capture", () => {
  test("captures the link for the approver and also hands it to delivery", async () => {
    const delivered: { email: string; url: string }[] = [];
    const capture = createSetupLinkCapture({ deliver: async (i) => void delivered.push(i) });
    await capture.onPasswordSetup({ email: "Owner@Mail.com", url: "https://p.test/set?t=1" });
    expect(capture.take("owner@mail.com")).toBe("https://p.test/set?t=1");
    expect(delivered).toEqual([{ email: "Owner@Mail.com", url: "https://p.test/set?t=1" }]);
  });

  test("a delivery failure never loses the link or fails the approval", async () => {
    const capture = createSetupLinkCapture({
      deliver: async () => {
        throw new Error("mail down for owner@mail.com");
      },
    });
    await capture.onPasswordSetup({ email: "owner@mail.com", url: "https://p.test/set?t=2" });
    expect(capture.take("owner@mail.com")).toBe("https://p.test/set?t=2");
  });

  test("without delivery it behaves as before", async () => {
    const capture = createSetupLinkCapture();
    await capture.onPasswordSetup({ email: "a@b.test", url: "https://p.test/x" });
    expect(capture.take("a@b.test")).toBe("https://p.test/x");
    expect(capture.take("a@b.test")).toBeUndefined();
  });
});
