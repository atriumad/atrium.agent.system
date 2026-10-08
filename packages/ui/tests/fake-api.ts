import type { Me } from "../src/api";

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
