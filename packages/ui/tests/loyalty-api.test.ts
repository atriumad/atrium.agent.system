import { afterEach, describe, expect, mock, test } from "bun:test";
import { ApiError, api } from "../src/api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(status: number, body: unknown) {
  const fetchMock = mock(
    async (_path: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const LOC = "7f9c24e8-3b1a-4c55-9d52-0b8f6a1c2d3e";

describe("loyalty client", () => {
  test("stamp posts the body as given and a 409 keeps reason and retryAt in detail", async () => {
    const body = { locationId: LOC, code: "ABCD-EFGH", idempotencyKey: "k1" };
    const ok = answer(201, {
      cardId: "c1",
      stampsInCycle: 1,
      stampsRequired: 3,
      rewardEarned: false,
      rewardReady: false,
    });
    const stamped = await api.loyaltyStamp(body);
    expect(stamped.stampsInCycle).toBe(1);
    const [path, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/loyalty/stamps");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(body);

    answer(409, { error: "refused", reason: "cooldown", retryAt: "2026-10-19T16:40:00.000Z" });
    const err = (await api.loyaltyStamp(body).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("refused");
    expect(err.detail.reason).toBe("cooldown");
    expect(err.detail.retryAt).toBe("2026-10-19T16:40:00.000Z");
  });

  test("an error without a body has an empty detail", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 500 })) as never;
    const err = (await api.loyaltyProgram(LOC).catch((e) => e)) as ApiError;
    expect(err.detail).toEqual({});
  });

  test("activity builds range, place, kind, page and pageSize into the query", async () => {
    const m = answer(200, { rows: [], total: 0, page: 2, pageSize: 10 });
    await api.loyaltyActivity({ range: "7d", place: "p1", kind: "void", page: 2, pageSize: 10 });
    expect((m.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/loyalty/activity?range=7d&place=p1&kind=void&page=2&pageSize=10",
    );
    await api.loyaltyActivity({ range: "30d", page: 1, pageSize: 25 });
    expect((m.mock.calls[1] as unknown as [string])[0]).toBe(
      "/api/loyalty/activity?range=30d&page=1&pageSize=25",
    );
  });

  test("the other calls hit Delivery A's urls and unwrap their bodies", async () => {
    const m = answer(200, { program: null, card: { cardId: "c1" }, url: null, token: "t" });
    expect(await api.loyaltyProgram(LOC)).toBeNull();
    expect(((await api.loyaltyCard(LOC, "ab cd")) as { cardId: string }).cardId).toBe("c1");
    expect(await api.loyaltyJoinLink(LOC)).toMatchObject({ token: "t" });
    await api.loyaltyBand("7d", "p1");
    await api.loyaltyBand("30d");
    await api.rotateLoyaltyQr(LOC);
    await api.loyaltyRedeem({ locationId: LOC, code: "x", idempotencyKey: "k" });
    await api.loyaltyVoid({ cardId: "c1", reason: "oops", idempotencyKey: "k" });
    await api.saveLoyaltyProgram(LOC, {
      name: "n",
      stampsRequired: 3,
      rewardLabel: "r",
      cooldownMinutes: 0,
      active: true,
      accent: "lime",
    });
    const calls = m.mock.calls.map((c) => {
      const [p, i] = c as unknown as [string, RequestInit | undefined];
      return `${i?.method ?? "GET"} ${p}`;
    });
    expect(calls).toEqual([
      `GET /api/loyalty/program?locationId=${LOC}`,
      `GET /api/loyalty/card?locationId=${LOC}&code=ab+cd`,
      `GET /api/loyalty/program/join-link?locationId=${LOC}`,
      "GET /api/insights/loyalty?range=7d&place=p1",
      "GET /api/insights/loyalty?range=30d",
      "POST /api/loyalty/program/rotate-qr",
      "POST /api/loyalty/redeem",
      "POST /api/loyalty/void",
      "PUT /api/loyalty/program",
    ]);
  });
});
