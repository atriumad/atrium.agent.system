import type { AgencyOverview, Me, OwnerInsights } from "../src/api";

/** A full `Me` with every capability off; tests switch on what they need. */
export function meOf(over: Partial<Me> = {}): Me {
  return {
    userId: "u1",
    name: "Test Person",
    role: "client_owner",
    kind: "client",
    canWorkCases: false,
    canReadSurveys: false,
    canRequestLocations: false,
    canManageLocations: false,
    canViewForms: false,
    canOperateSurveys: false,
    canManageSurveys: false,
    canRequestSurveys: false,
    ...over,
  };
}

export const ownerMe = meOf({
  name: "Olivia Owner",
  role: "client_owner",
  kind: "client",
  canReadSurveys: true,
  canViewForms: true,
  canOperateSurveys: true,
  canRequestLocations: true,
  canRequestSurveys: true,
});

export const amMe = meOf({
  name: "Alex Manager",
  role: "account_manager",
  kind: "assigned",
  canWorkCases: true,
  canReadSurveys: true,
  canViewForms: true,
  canOperateSurveys: true,
  canManageSurveys: true,
  canManageLocations: true,
});

const real = globalThis.fetch;

/** Answers `fetch` by path; a value may be a function. Anything else is a 404. Restore with `restoreFetch`. */
export function fakeFetch(routes: Record<string, unknown | (() => unknown)>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input.toString();
    calls.push({ path, ...(init ? { init } : {}) });
    const hit = routes[path];
    if (hit === undefined) return new Response("{}", { status: 404 });
    const body = typeof hit === "function" ? (hit as () => unknown)() : hit;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

export function restoreFetch() {
  globalThis.fetch = real;
}

export const ownerInsightsFixture: OwnerInsights = {
  range: "30d",
  generatedAt: "2026-10-18T09:00:00.000Z",
  window: { from: "2026-09-19", to: "2026-10-18" },
  rating: {
    value: 4.3,
    change: 0.2,
    n: 12,
    small: false,
    spark: [4.1, 4.2, 4.0, 4.4, 4.3, 4.5, 4.3],
  },
  responses: {
    value: 12,
    change: 3,
    n: 12,
    small: false,
    spark: [1, 2, 0, 3, 1, 2, 3],
    answerRate: 0.4,
    sent: 30,
  },
  reviewClicks: { clicks: 5, answers: 9, rate: 0.56, change: 0.08, small: false },
  waiting: { open: 1, overdue: 1 },
  series: [
    { date: "2026-09-19", average: 4.2, count: 1 },
    { date: "2026-09-20", average: 4.4, count: 2 },
    { date: "2026-09-21", average: null, count: 0 },
    { date: "2026-09-22", average: 4.1, count: 1 },
    { date: "2026-09-23", average: 4.5, count: 2 },
    { date: "2026-09-24", average: 4.3, count: 3 },
    { date: "2026-09-25", average: 4.0, count: 1 },
    { date: "2026-09-26", average: 4.6, count: 2 },
    { date: "2026-09-27", average: 4.2, count: 3 },
    { date: "2026-09-28", average: 4.4, count: 1 },
    { date: "2026-09-29", average: 4.2, count: 2 },
    { date: "2026-09-30", average: 4.4, count: 3 },
    { date: "2026-10-01", average: null, count: 0 },
    { date: "2026-10-02", average: 4.1, count: 2 },
    { date: "2026-10-03", average: 4.5, count: 3 },
    { date: "2026-10-04", average: 4.3, count: 1 },
    { date: "2026-10-05", average: 4.0, count: 2 },
    { date: "2026-10-06", average: 4.6, count: 3 },
    { date: "2026-10-07", average: 4.2, count: 1 },
    { date: "2026-10-08", average: 4.4, count: 2 },
    { date: "2026-10-09", average: 4.2, count: 3 },
    { date: "2026-10-10", average: 4.4, count: 1 },
    { date: "2026-10-11", average: null, count: 0 },
    { date: "2026-10-12", average: 4.1, count: 3 },
    { date: "2026-10-13", average: 4.5, count: 1 },
    { date: "2026-10-14", average: 4.3, count: 2 },
    { date: "2026-10-15", average: 4.0, count: 3 },
    { date: "2026-10-16", average: 4.6, count: 1 },
    { date: "2026-10-17", average: 4.2, count: 2 },
    { date: "2026-10-18", average: 4.4, count: 3 },
  ],
  topics: [
    { topic: "service", total: 8, positive: 6, neutral: 1, negative: 1 },
    { topic: "speed", total: 6, positive: 3, neutral: 1, negative: 2 },
    { topic: "cleanliness", total: 5, positive: 5, neutral: 0, negative: 0 },
    { topic: "price", total: 4, positive: 1, neutral: 2, negative: 1 },
    { topic: "staff", total: 3, positive: 3, neutral: 0, negative: 0 },
  ],
  read: 9,
  places: [
    {
      locationId: "p1",
      name: "Downtown",
      rating: 4.5,
      change: 0.3,
      responses: 7,
      openCases: 2,
      overdueCases: 1,
    },
    {
      locationId: "p2",
      name: "Harbor",
      rating: 4.0,
      change: -0.1,
      responses: 5,
      openCases: 0,
      overdueCases: 0,
    },
    {
      locationId: "p3",
      name: "Airport",
      rating: null,
      change: null,
      responses: 0,
      openCases: 0,
      overdueCases: 0,
    },
  ],
  host: { requestsSent: 30, casesOpened: 3, answersRead: 9 },
};

export const agencyInsightsFixture: AgencyOverview = {
  range: "30d",
  generatedAt: "2026-10-18T09:00:00.000Z",
  window: { from: "2026-09-19", to: "2026-10-18" },
  contact: { medianHours: 6.2, insideTarget: 0.94, cases: 17, change: -1.5, small: false },
  needingCases: 4,
  overdue: { value: 2, previous: 3 },
  portfolio: {
    value: 4.2,
    change: 0.1,
    n: 86,
    small: false,
    spark: [4.0, 4.1, 4.2, 4.1, 4.3, 4.2],
  },
  answerRate: { value: 0.38, change: 0.04, sent: 226, answered: 86, small: false },
  clients: [
    {
      clientId: "c1",
      name: "Acme Dental",
      places: 3,
      rating: 4.5,
      change: 0.2,
      spark: [4.3, 4.4, 4.5, 4.5],
      responses: 31,
      answerRate: 0.42,
      overdue: 1,
      pendingPlaces: 0,
    },
    {
      clientId: "c2",
      name: "Blue Harbor Cafe",
      places: 2,
      rating: 3.9,
      change: -0.3,
      spark: [4.2, 4.0, 3.9, 3.8],
      responses: 24,
      answerRate: 0.33,
      overdue: 1,
      pendingPlaces: 1,
    },
    {
      clientId: "c3",
      name: "Cedar Fitness",
      places: 4,
      rating: 4.3,
      change: 0.0,
      spark: [4.2, 4.3, 4.3, 4.4],
      responses: 31,
      answerRate: 0.4,
      overdue: 0,
      pendingPlaces: 0,
    },
    {
      clientId: "c4",
      name: "Dune Motors",
      places: 1,
      rating: null,
      change: null,
      spark: [],
      responses: 0,
      answerRate: null,
      overdue: 0,
      pendingPlaces: 0,
    },
  ],
  cases: [
    {
      id: "k1",
      clientId: "c2",
      clientName: "Blue Harbor Cafe",
      locationName: "Pier 4",
      severity: "high",
      summary: "Waited 40 minutes and nobody apologised",
      dueAt: "2026-10-17T12:00:00.000Z",
      overdue: true,
    },
  ],
  queue: [
    {
      kind: "case",
      id: "k1",
      client: "Blue Harbor Cafe",
      place: "Pier 4",
      detail: "Waited 40 minutes and nobody apologised",
      severity: "high",
      dueAt: "2026-10-17T12:00:00.000Z",
      overdue: true,
      href: "/reputation/cases?case=k1",
    },
    {
      kind: "approval",
      id: "a1",
      client: "Acme Dental",
      place: "Uptown",
      detail: "Asked to add a place",
      severity: null,
      dueAt: null,
      overdue: false,
      href: "/approvals/places",
    },
    {
      kind: "place",
      id: "l9",
      client: "Cedar Fitness",
      place: "Riverside",
      detail: "Waiting for approval",
      severity: null,
      dueAt: null,
      overdue: false,
      href: "/approvals/places",
    },
  ],
  queueCounts: { cases: 4, approvals: 3, accounts: 1, places: 2 },
};
