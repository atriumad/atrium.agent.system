/** The browser's side of the case routes. Same origin: each app proxies `/api` to the API. */

export type Me = {
  userId: string;
  name: string;
  role: string;
  kind: "agency" | "assigned" | "client";
  canWorkCases: boolean;
};

export type CaseSummary = {
  id: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  severity: "low" | "medium" | "high";
  status: "open" | "contacted" | "resolved";
  openedAt: string;
  dueAt: string;
  rating: number;
  wantsContact: boolean;
};

export type CaseDetail = CaseSummary & {
  contactedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  note: string | null;
  response: {
    bestPart: string | null;
    improve: string | null;
    comment: string | null;
    createdAt: string;
  };
  contact: { email: string | null; phone: string | null } | null;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? "error");
  return body as T;
}

export const api = {
  me: () => call<Me>("/api/me"),
  cases: () => call<{ cases: CaseSummary[] }>("/api/cases").then((r) => r.cases),
  detail: (id: string) => call<{ case: CaseDetail }>(`/api/cases/${id}`).then((r) => r.case),
  advance: (id: string, to: "contacted" | "resolved", note: string) =>
    call<{ case: CaseDetail }>(`/api/cases/${id}/advance`, {
      method: "POST",
      body: JSON.stringify({ to, note: note.trim() || null }),
    }).then((r) => r.case),
  signIn: (email: string, password: string) =>
    call<unknown>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signOut: () => call<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),
};
