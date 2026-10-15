import { describe, expect, test } from "bun:test";
import { resendTransport, TransportUnavailableError } from "../infra/resend";

const message = {
  channel: "email" as const,
  to: "ana.lopez@mail.com",
  subject: "How was your visit?",
  body: "plain text",
  html: "<p>html</p>",
  headers: { "List-Unsubscribe": "<https://x.test/u>" },
  idempotencyKey: "req-1",
};
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the Resend transport", () => {
  test("posts the email with the key, the sender and the idempotency key, and returns the provider id", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const t = resendTransport({
      apiKey: "re_secret",
      from: "Atrium <no-reply@mail.test>",
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return reply(200, { id: "msg_1" });
      }) as unknown as typeof fetch,
    });
    expect(t.name).toBe("resend");
    expect(await t.deliver(message)).toEqual({ status: "sent", providerId: "msg_1" });
    expect(seen?.url).toBe("https://api.resend.com/emails");
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_secret");
    expect(headers["idempotency-key"]).toBe("req-1");
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      from: "Atrium <no-reply@mail.test>",
      to: ["ana.lopez@mail.com"],
      subject: "How was your visit?",
      text: "plain text",
      html: "<p>html</p>",
      headers: { "List-Unsubscribe": "<https://x.test/u>" },
    });
  });

  test("a message with no html, headers or idempotency key sends only what it has", async () => {
    let body = "";
    let headers: Record<string, string> = {};
    const t = resendTransport({
      apiKey: "k",
      from: "a@b.test",
      fetch: (async (_u: string, init: RequestInit) => {
        body = String(init.body);
        headers = init.headers as Record<string, string>;
        return reply(200, { id: "m" });
      }) as unknown as typeof fetch,
    });
    await t.deliver({ ...message, html: null, headers: null, idempotencyKey: null });
    expect(JSON.parse(body)).toEqual({
      from: "a@b.test",
      to: ["ana.lopez@mail.com"],
      subject: "How was your visit?",
      text: "plain text",
    });
    expect(headers["idempotency-key"]).toBeUndefined();
  });

  test("a 4xx is a failed delivery, not an error", async () => {
    const t = resendTransport({
      apiKey: "k",
      from: "a@b.test",
      fetch: (async () =>
        reply(422, { message: "bad address ana.lopez@mail.com" })) as unknown as typeof fetch,
    });
    expect(await t.deliver(message)).toEqual({ status: "failed", providerId: null });
  });

  test("429, 5xx and network failures throw an error that carries no address and no key", async () => {
    const cases: [() => Promise<Response>, string, number | undefined][] = [
      [async () => reply(429, { message: "slow down ana.lopez@mail.com" }), "rate_limited", 429],
      [async () => reply(503, { message: "ana.lopez@mail.com re_secret" }), "provider_error", 503],
      [
        async () => {
          throw new TypeError("connect ECONNREFUSED ana.lopez@mail.com");
        },
        "network",
        undefined,
      ],
    ];
    for (const [fn, kind, status] of cases) {
      const t = resendTransport({
        apiKey: "re_secret",
        from: "a@b.test",
        fetch: fn as unknown as typeof fetch,
      });
      const error = (await t.deliver(message).then(
        () => null,
        (e: unknown) => e,
      )) as TransportUnavailableError;
      expect(error).toBeInstanceOf(TransportUnavailableError);
      expect(error.kind).toBe(kind as TransportUnavailableError["kind"]);
      expect(error.status).toBe(status);
      expect(error.message).not.toContain("ana.lopez");
      expect(error.message).not.toContain("re_secret");
    }
  });
});
