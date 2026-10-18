import { afterEach, describe, expect, mock, test } from "bun:test";
import { api } from "../src/api";
import {
  casesBandFixture,
  casesTableFixture,
  responsesBandFixture,
  responsesPageFixture,
} from "./fake-api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stub(body: unknown = {}) {
  const fetchMock = mock(async () => new Response(JSON.stringify(body), { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return () => (fetchMock.mock.calls[0] as unknown as [string])[0];
}

describe("table pages client", () => {
  test("responsesPage builds the URL in field order", async () => {
    const url = stub(responsesPageFixture);
    await api.responsesPage({
      range: "30d",
      page: 2,
      pageSize: 25,
      sort: "date",
      dir: "desc",
      q: "cold",
      maxRating: 3,
    });
    expect(url()).toBe(
      "/api/surveys/responses?range=30d&page=2&pageSize=25&sort=date&dir=desc&q=cold&maxRating=3",
    );
  });
  test("responsesPage omits empties and sends flags as 1", async () => {
    const url = stub(responsesPageFixture);
    await api.responsesPage({
      range: "7d",
      place: "p1",
      q: "",
      wantsContact: true,
      hasCase: false,
      safety: true,
      page: 1,
    });
    expect(url()).toBe("/api/surveys/responses?range=7d&place=p1&page=1&wantsContact=1&safety=1");
  });
  test("responsesPage defaults to page 1", async () => {
    const url = stub(responsesPageFixture);
    await api.responsesPage({ range: "90d" });
    expect(url()).toBe("/api/surveys/responses?range=90d&page=1");
  });
  test("responsesPage keeps place, rating, sentiment and topic in order", async () => {
    const url = stub(responsesPageFixture);
    await api.responsesPage({
      range: "30d",
      place: "p1",
      page: 3,
      rating: 2,
      sentiment: "mixed",
      topic: "wait",
      hasCase: true,
    });
    expect(url()).toBe(
      "/api/surveys/responses?range=30d&place=p1&page=3&rating=2&sentiment=mixed&topic=wait&hasCase=1",
    );
  });
  test("casesTable", async () => {
    const url = stub(casesTableFixture);
    await api.casesTable("7d");
    expect(url()).toBe("/api/cases?range=7d");
  });
  test("cases still returns the list", async () => {
    stub(casesTableFixture);
    expect(await api.cases()).toEqual(casesTableFixture.cases);
  });
  test("casesBand with a place", async () => {
    const url = stub(casesBandFixture);
    await api.casesBand("90d", "p1");
    expect(url()).toBe("/api/insights/cases?range=90d&place=p1");
  });
  test("responsesBand without a place", async () => {
    const url = stub(responsesBandFixture);
    await api.responsesBand("30d");
    expect(url()).toBe("/api/insights/responses?range=30d");
  });
});
