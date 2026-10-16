/** The browser's side of the case routes. Same origin: each app proxies `/api` to the API. */

export type Me = {
  userId: string;
  name: string;
  role: string;
  kind: "agency" | "assigned" | "client";
  canWorkCases: boolean;
  canReadSurveys: boolean;
  canRequestLocations: boolean;
  canManageLocations: boolean;
  canViewForms: boolean;
  canOperateSurveys: boolean;
  canManageSurveys: boolean;
  canRequestSurveys: boolean;
};

export type SurveyResponse = {
  id: string;
  clientName: string;
  locationId: string;
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

export type HelpAttachmentInput =
  | { kind: "response"; responseId: string }
  | { kind: "review"; url: string; rating?: number; text?: string };

export type ThreadAttachment =
  | {
      kind: "response";
      response: {
        id: string;
        locationName: string;
        rating: number;
        comment: string | null;
        bestPart: string | null;
        improve: string | null;
        sentiment: string | null;
        topics: string[];
        concern: string | null;
        safety: boolean | null;
        createdAt: string;
      } | null;
    }
  | { kind: "review"; url: string; rating: number | null; text: string | null };

export type ThreadMessage = {
  id: string;
  authorName: string;
  side: "client" | "agency";
  body: string;
  attachment: ThreadAttachment | null;
  createdAt: string;
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
  lastMessageAt: string | null;
  lastAuthorSide: "client" | "agency" | null;
  lastPreview: string | null;
  awaiting: "client" | "agency" | null;
};

export type ThreadRequest = SurveyRequest;
export type HelpThreadData = { request: ThreadRequest; messages: ThreadMessage[] };
export type PickableResponse = {
  id: string;
  createdAt: string;
  rating: number;
  excerpt: string;
  locationId: string;
  locationName: string;
};

export type PlaceStatus = "pending" | "active" | "suspended" | "rejected";

export type Place = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  status: PlaceStatus;
};

export type PlaceAction = "approve" | "reject" | "suspend" | "reactivate";

export type OnboardingRequest = {
  id: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  firstLocationName: string;
  firstLocationTimeZone: string;
  note: string | null;
  status: "open" | "approved" | "rejected";
  createdAt: string;
  reason: string | null;
};

export type AppNotification = {
  id: string;
  kind: string;
  subject: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** What it is about, so the panel can open it. Null on older notifications. */
  target: { type: "case" | "location" | "help_request"; id: string } | null;
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
  requestSurvey: (locationId: string, note: string, attachment?: HelpAttachmentInput) =>
    call<{ id: string }>("/api/surveys/requests", {
      method: "POST",
      body: JSON.stringify({
        locationId,
        note: note.trim(),
        ...(attachment ? { attachment } : {}),
      }),
    }),
  helpThread: (id: string) => call<HelpThreadData>(`/api/surveys/requests/${id}`),
  postHelpMessage: (id: string, body: string, attachment?: HelpAttachmentInput) =>
    call<unknown>(`/api/surveys/requests/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: body.trim(), ...(attachment ? { attachment } : {}) }),
    }),
  closeHelpRequest: (id: string, to: "fulfilled" | "dismissed", message?: string) =>
    call<unknown>(`/api/surveys/requests/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ to, ...(message?.trim() ? { message: message.trim() } : {}) }),
    }),
  pickableResponses: (opts: { requestId?: string; locationId?: string; id?: string } = {}) => {
    const query = new URLSearchParams();
    for (const key of ["requestId", "locationId", "id"] as const) {
      const value = opts[key];
      if (value) query.set(key, value);
    }
    const qs = query.toString();
    return call<{ responses: PickableResponse[] }>(
      `/api/surveys/responses/pickable${qs ? `?${qs}` : ""}`,
    ).then((r) => r.responses);
  },
  access: () => call<{ access: Record<string, string> }>("/api/access").then((r) => r.access),
  places: () => call<{ locations: Place[] }>("/api/locations").then((r) => r.locations),
  requestPlace: (name: string, timeZone: string) =>
    call<{ id: string }>("/api/locations/request", {
      method: "POST",
      body: JSON.stringify({ name, timeZone }),
    }),
  decidePlace: (id: string, action: PlaceAction, reason?: string) =>
    call<{ status: PlaceStatus }>(`/api/locations/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
    }),
  onboardingRequests: () =>
    call<{ requests: OnboardingRequest[] }>("/api/onboarding/requests").then((r) => r.requests),
  approveOnboarding: (id: string) =>
    call<{ clientId: string; setupUrl: string }>(`/api/onboarding/requests/${id}/approve`, {
      method: "POST",
      body: "{}",
    }),
  rejectOnboarding: (id: string, reason: string) =>
    call<unknown>(`/api/onboarding/requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  notifications: () =>
    call<{ notifications: AppNotification[]; unread: number }>("/api/notifications"),
  markNotificationsRead: (which: { ids: string[] } | { all: true }) =>
    call<unknown>("/api/notifications/read", { method: "POST", body: JSON.stringify(which) }),
  signIn: (email: string, password: string) =>
    call<unknown>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signOut: () => call<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),
};
