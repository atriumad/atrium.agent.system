import { beforeEach, describe, expect, test } from "bun:test";
import { clientIp, forwardLoyalty } from "../lib/proxy";

const TOKEN = "t".repeat(22);
const CARD_COOKIE =
  "atr_card_dev=11111111-1111-4111-8111-111111111111; Path=/; HttpOnly; SameSite=Lax";

let sent: Request[] = [];
let reply: () => Response;
const created = () =>
  new Response(JSON.stringify({ token: TOKEN, shortCode: "ABCD-EFGH" }), {
    status: 201,
    headers: { "content-type": "application/json", "set-cookie": CARD_COOKIE },
  });
const fake = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input as string, init));
    return reply();
  },
  {
    last: () => sent[sent.length - 1] as Request,
    get calls() {
      return sent.length;
    },
  },
) as unknown as typeof fetch & { last(): Request; calls: number };

const env = { apiUrl: "http://api.test", hops: 1, proxySecret: "p".repeat(32), fetch: fake };
const post = (path: string, headers: Record<string, string> = {}, body = "{}") =>
  new Request(`http://card.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

beforeEach(() => {
  sent = [];
  reply = created;
});

describe("clientIp", () => {
  test("takes the entry `hops` from the right and ignores what the client wrote", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1)).toBe(
      "203.0.113.9",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }), 2)).toBe(
      "203.0.113.9",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.4" }), 0)).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "not-an-ip" }), 1)).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }), 3)).toBeNull();
    expect(clientIp(new Headers(), 0)).toBeNull();
    expect(clientIp(new Headers(), 1)).toBeNull();
  });
});

describe("forwardLoyalty", () => {
  test("the upstream request has exactly one X-Forwarded-For, the proxy secret, and no spoofed forwarding headers", async () => {
    await forwardLoyalty(
      post("/loyalty-api/cards", {
        "x-forwarded-for": "6.6.6.6, 203.0.113.9",
        "x-forwarded-host": "evil.test",
        "x-real-ip": "6.6.6.6",
        forwarded: "for=6.6.6.6",
        "x-atrium-proxy": "forged",
        "x-forwarded-proto": "https, http",
      }),
      ["cards"],
      env,
    );
    const up = fake.last();
    expect(up.url).toBe("http://api.test/v1/loyalty/cards");
    expect(up.headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(up.headers.get("x-atrium-proxy")).toBe("p".repeat(32));
    expect(up.headers.get("x-real-ip")).toBeNull();
    expect(up.headers.get("forwarded")).toBeNull();
    expect(up.headers.get("x-forwarded-host")).toBeNull();
    expect(up.headers.get("x-forwarded-proto")).toBe("https");
  });

  test("with no trusted hop nothing is forwarded: the API falls back to the server's address", async () => {
    await forwardLoyalty(
      post("/loyalty-api/cards", { "x-forwarded-for": "6.6.6.6", "x-forwarded-proto": "https" }),
      ["cards"],
      { ...env, hops: 0 },
    );
    const up = fake.last();
    expect(up.headers.get("x-forwarded-for")).toBeNull();
    expect(up.headers.get("x-forwarded-proto")).toBeNull();
    expect(up.headers.get("x-atrium-proxy")).toBe("p".repeat(32));
  });

  test("an unconfigured secret sends no x-atrium-proxy, and a forged one never goes up", async () => {
    await forwardLoyalty(post("/loyalty-api/cards", { "x-atrium-proxy": "forged" }), ["cards"], {
      apiUrl: "http://api.test",
      hops: 0,
      fetch: fake,
    });
    expect(fake.last().headers.get("x-atrium-proxy")).toBeNull();
  });

  test("only the device cookie goes up, and it comes back on /loyalty-api only", async () => {
    const res = await forwardLoyalty(
      post("/loyalty-api/cards", { cookie: "atr_card_dev=abc; atr_session=s; other=1" }),
      ["cards"],
      env,
    );
    expect(fake.last().headers.get("cookie")).toBe("atr_card_dev=abc");
    const set = res.headers.getSetCookie();
    expect(set).toHaveLength(1);
    expect(set[0]).toContain("atr_card_dev=");
    expect(set[0]).toContain("Path=/loyalty-api");
    expect(set[0]).not.toContain("Path=/;");
    expect(res.status).toBe(201);
  });

  test("a Set-Cookie for any other name is dropped", async () => {
    reply = () => {
      const h = new Headers({ "content-type": "application/json" });
      h.append("set-cookie", "atr_session=x; Path=/; HttpOnly");
      return new Response("{}", { status: 200, headers: h });
    };
    const res = await forwardLoyalty(post("/loyalty-api/cards"), ["cards"], env);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("ETag and If-None-Match pass through; a 304 has no body", async () => {
    reply = () => new Response(null, { status: 304, headers: { etag: '"e1"' } });
    const res = await forwardLoyalty(
      new Request(`http://card.test/loyalty-api/cards/${TOKEN}`, {
        headers: { "if-none-match": '"e1"' },
      }),
      ["cards", TOKEN],
      env,
    );
    expect(fake.last().headers.get("if-none-match")).toBe('"e1"');
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"e1"');
    expect(await res.text()).toBe("");
  });

  test("responses are no-store, keep Retry-After, and carry no CORS header", async () => {
    reply = () =>
      new Response('{"error":"rate_limited"}', {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "120",
          "access-control-allow-origin": "*",
        },
      });
    const res = await forwardLoyalty(post("/loyalty-api/cards"), ["cards"], env);
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("retry-after")).toBe("120");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("the email route is forwarded with its token encoded", async () => {
    await forwardLoyalty(post(`/loyalty-api/cards/${TOKEN}/email`), ["cards", TOKEN, "email"], env);
    expect(fake.last().url).toBe(`http://api.test/v1/loyalty/cards/${TOKEN}/email`);
  });

  test("only the three card routes are forwarded", async () => {
    for (const [method, path] of [
      ["GET", ["cards"]],
      ["POST", ["programs"]],
      ["GET", ["cards", "short"]],
      ["GET", ["cards", TOKEN, "email"]],
      ["POST", ["cards", TOKEN]],
      ["POST", ["cards", "..", "x"]],
      ["POST", []],
    ] as const) {
      const res = await forwardLoyalty(
        new Request("http://card.test/x", { method }),
        [...path],
        env,
      );
      expect([404, 405]).toContain(res.status);
    }
    expect(fake.calls).toBe(0);
  });

  test("a known shape with the wrong method is 405, an unknown path 404", async () => {
    const wrong = await forwardLoyalty(new Request("http://card.test/x"), ["cards"], env);
    expect(wrong.status).toBe(405);
    const unknown = await forwardLoyalty(new Request("http://card.test/x"), ["nope"], env);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not_found" });
  });

  test("a body over 8 KiB is 413 without an upstream call", async () => {
    const res = await forwardLoyalty(
      post("/loyalty-api/cards", {}, "x".repeat(9000)),
      ["cards"],
      env,
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    expect(fake.calls).toBe(0);
  });

  test("the cap is enforced while streaming: a lying or absent Content-Length stops at the cap", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(1024).fill(120);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 1000) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const req = new Request("http://card.test/loyalty-api/cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const res = await forwardLoyalty(req, ["cards"], env);
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(50);
    expect(fake.calls).toBe(0);
    // a declared length over the cap is refused before the body is read at all
    const declared = await forwardLoyalty(
      post("/loyalty-api/cards", { "content-length": "9000" }, "{}"),
      ["cards"],
      env,
    );
    expect(declared.status).toBe(413);
    expect(fake.calls).toBe(0);
  });

  test("an API that does not answer is 502 unavailable", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await forwardLoyalty(post("/loyalty-api/cards"), ["cards"], {
      ...env,
      fetch: down,
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
