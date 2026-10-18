import { afterEach, describe, expect, mock, test } from "bun:test";
import { api } from "../src/api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stub() {
  const fetchMock = mock(
    async () => new Response(JSON.stringify({ range: "7d" }), { status: 200 }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return () => (fetchMock.mock.calls[0] as unknown as [string])[0];
}

describe("insights client", () => {
  test("owner with a place", async () => {
    const url = stub();
    await api.insightsOwner("7d", "p1");
    expect(url()).toBe("/api/insights/owner?range=7d&place=p1");
  });
  test("owner without a place omits it", async () => {
    const url = stub();
    await api.insightsOwner("30d");
    expect(url()).toBe("/api/insights/owner?range=30d");
  });
  test("agency with a client", async () => {
    const url = stub();
    await api.insightsAgency("90d", "c1");
    expect(url()).toBe("/api/insights/agency?range=90d&client=c1");
  });
  test("agency without a client omits it", async () => {
    const url = stub();
    await api.insightsAgency("7d");
    expect(url()).toBe("/api/insights/agency?range=7d");
  });
});
