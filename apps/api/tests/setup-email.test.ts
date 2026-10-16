import { describe, expect, test } from "bun:test";
import type { OutgoingMessage } from "@atrium/core";
import { sendSetPasswordEmail } from "../src/setup-email";

describe("the set-password email", () => {
  test("goes to the owner with the link in both versions and an idempotency key, and logs only a masked address", async () => {
    const sent: OutgoingMessage[] = [];
    const logs: string[] = [];
    await sendSetPasswordEmail(
      { name: "fake", deliver: async (m) => (sent.push(m), { status: "sent", providerId: "m" }) },
      { email: "ana.lopez@mail.com", url: "https://platform.test/set-password?token=t" },
      {
        info: (m, f) => void logs.push(JSON.stringify({ m, f })),
        error: (m, f) => void logs.push(JSON.stringify({ m, f })),
      },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ana.lopez@mail.com");
    expect(sent[0]?.subject).toBe("Set your Atrium password");
    expect(sent[0]?.html).toContain("https://platform.test/set-password?token=t");
    expect(sent[0]?.body).toContain("https://platform.test/set-password?token=t");
    expect(sent[0]?.idempotencyKey).toMatch(/^set-password-/);
    const logged = logs.join("\n");
    expect(logged).not.toContain("ana.lopez");
    expect(logged).not.toContain("token=t");
  });

  test("a failed delivery is logged without the address or the link and does not throw", async () => {
    const logs: string[] = [];
    await sendSetPasswordEmail(
      {
        name: "fake",
        deliver: async () => {
          throw new Error("down for ana.lopez@mail.com https://x?token=t");
        },
      },
      { email: "ana.lopez@mail.com", url: "https://platform.test/set-password?token=t" },
      { info: (m) => void logs.push(m), error: (m, f) => void logs.push(JSON.stringify({ m, f })) },
    );
    expect(logs.join("\n")).not.toContain("ana.lopez");
    expect(logs.join("\n")).not.toContain("token=t");
  });

  for (const [status, expected, kind] of [
    ["failed", "setup_email.failed", "rejected"],
    ["recorded", "setup_email.recorded", undefined],
  ] as const) {
    test(`a ${status} result is logged as ${expected}, never as sent, without address or link`, async () => {
      const logs: { m: string; f: Record<string, unknown> | undefined }[] = [];
      const log = (m: string, f?: Record<string, unknown>) => void logs.push({ m, f });
      await sendSetPasswordEmail(
        { name: "fake", deliver: async () => ({ status, providerId: null }) },
        { email: "ana.lopez@mail.com", url: "https://platform.test/set-password?token=t" },
        { info: log, error: log },
      );
      expect(logs.map((l) => l.m)).toEqual([expected]);
      if (kind) expect(logs[0]?.f?.kind).toBe(kind);
      const logged = JSON.stringify(logs);
      expect(logged).not.toContain("ana.lopez");
      expect(logged).not.toContain("token=t");
    });
  }
});
