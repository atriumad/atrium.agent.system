/** The browser's side of the case routes. Same origin: each app proxies `/api` to the API. */

export type Me = {
  userId: string;
  name: string;
  role: string;
  kind: "agency" | "assigned" | "client";
  canWorkCases: boolean;
  canReadSurveys: boolean;
  canViewForms: boolean;
  canOperateSurveys: boolean;
  canManageSurveys: boolean;
  canRequestSurveys: boolean;
};

export type SurveyResponse = {
  id: string;
  clientName: string;
  locationName: string;
  rating: number;
  bestPart: string | null;
  improve: string | null;
  comment: string | null;
  wantsContact: boolean;
  source: "invitation" | "qr";
  reviewClicked: boolean;
  caseId: string | null;
  createdAt: string;
};

export type SurveyForm = {
  locationId: string;
  locationName: string;
  clientName: string;
  reviewUrl: string | null;
  requestDelayMinutes: number;
  qrVersion: number;
  status: "pending" | "active" | "suspended" | "rejected";
  qrUrl: string | null;
};

export type SurveyRequest = {
  id: string;
  clientName: string;
  locationName: string;
  requestedByName: string;
  note: string | null;
  status: "open" | "fulfilled" | "dismissed";
  createdAt: string;
  handledAt: string | null;
  response: string | null;
};

export type PlaceOption = { id: string; locationName: string; clientName: string };

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
  surveyResponses: (maxRating?: number) =>
    call<{ responses: SurveyResponse[] }>(
      `/api/surveys/responses${maxRating ? `?maxRating=${maxRating}` : ""}`,
    ).then((r) => r.responses),
  surveyForms: () => call<{ forms: SurveyForm[] }>("/api/surveys/forms").then((r) => r.forms),
  surveyLocations: () =>
    call<{ locations: PlaceOption[] }>("/api/surveys/locations").then((r) => r.locations),
  surveyLink: (locationId: string) =>
    call<{ url: string; expiresAt: string }>(`/api/surveys/forms/${locationId}/link`, {
      method: "POST",
      body: "{}",
    }),
  saveSurveySettings: (
    locationId: string,
    settings: { reviewUrl?: string | null; requestDelayMinutes?: number },
  ) =>
    call<unknown>(`/api/surveys/forms/${locationId}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  rotateSurveyQr: (locationId: string) =>
    call<{ qrVersion: number }>(`/api/surveys/forms/${locationId}/rotate-qr`, {
      method: "POST",
      body: "{}",
    }),
  surveyRequests: () =>
    call<{ requests: SurveyRequest[] }>("/api/surveys/requests").then((r) => r.requests),
  requestSurvey: (locationId: string, note: string) =>
    call<{ id: string }>("/api/surveys/requests", {
      method: "POST",
      body: JSON.stringify({ locationId, note: note.trim() || null }),
    }),
  handleSurveyRequest: (id: string, to: "fulfilled" | "dismissed", response: string) =>
    call<unknown>(`/api/surveys/requests/${id}/handle`, {
      method: "POST",
      body: JSON.stringify({ to, response: response.trim() || null }),
    }),
  signIn: (email: string, password: string) =>
    call<unknown>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signOut: () => call<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),
};
