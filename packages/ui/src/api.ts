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

export type RangeKey = "7d" | "30d" | "90d";

export type Tile = {
  value: number | null;
  change: number | null;
  n: number;
  small: boolean;
  spark: number[];
};

/** One row of the Responses table; the server's `ResponseTableRow` with dates as strings. */
export type ResponseTableRow = SurveyResponse & {
  clientId: string;
  severity: string | null;
  /** Null while the answer is unread (no reading yet): sentiment, topics, concern and safety. */
  sentiment: string | null;
  topics: string[] | null;
  concern: string | null;
  safety: boolean | null;
};

export type ResponsesPage = {
  rows: ResponseTableRow[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
  counts: { all: number; lowRating: number; wantsContact: number; hasCase: number; safety: number };
};

export type ResponseSort = "date" | "rating" | "place" | "sentiment";

export type Topic =
  | "food"
  | "service"
  | "wait"
  | "cleanliness"
  | "price"
  | "atmosphere"
  | "staff"
  | "other";

export type ResponsesQuery = {
  range: RangeKey;
  place?: string;
  page?: number;
  pageSize?: number;
  sort?: ResponseSort;
  dir?: "asc" | "desc";
  q?: string;
  maxRating?: number;
  rating?: number;
  /** The contract's SENTIMENTS and TOPICS (packages/contracts/src/sentiment.ts). */
  sentiment?: "positive" | "mixed" | "negative";
  topic?: Topic;
  wantsContact?: boolean;
  hasCase?: boolean;
  safety?: boolean;
};

export type CaseTab = "active" | "open" | "contacted" | "resolved" | "all";

export type CaseTableRow = CaseSummary & {
  comment: string | null;
  topics: string[] | null;
  sentiment: string | null;
  safety: boolean | null;
};

export type CasesTable = {
  cases: CaseTableRow[];
  counts: Record<CaseTab, number>;
  truncated: boolean;
};

export type ResponsesBand = {
  range: RangeKey;
  generatedAt: string;
  window: { from: string; to: string };
  responses: Tile;
  rating: Tile;
  negativeShare: { value: number | null; change: number | null; read: number; small: boolean };
  reviewClicks: {
    clicks: number;
    answers: number;
    rate: number | null;
    change: number | null;
    small: boolean;
  };
  distribution: [number, number, number, number, number];
};

export type CasesBand = {
  range: RangeKey;
  generatedAt: string;
  window: { from: string; to: string };
  open: number;
  overdue: { value: number; previous: number };
  contact: {
    medianHours: number | null;
    insideTarget: number | null;
    cases: number;
    change: number | null;
    small: boolean;
  };
  resolved: { value: number; change: number | null; small: boolean };
  openedPerDay: { date: string; count: number }[];
  bySeverity: { high: number; medium: number; low: number };
};

export type OwnerInsights = {
  range: RangeKey;
  generatedAt: string;
  window: { from: string; to: string };
  rating: Tile;
  responses: Tile & { answerRate: number | null; sent: number };
  reviewClicks: {
    clicks: number;
    answers: number;
    rate: number | null;
    change: number | null;
    small: boolean;
  };
  waiting: { open: number; overdue: number };
  series: { date: string; average: number | null; count: number }[];
  topics: { topic: string; total: number; positive: number; neutral: number; negative: number }[];
  read: number;
  places: {
    locationId: string;
    name: string;
    rating: number | null;
    change: number | null;
    responses: number;
    openCases: number;
    overdueCases: number;
  }[];
  host: { requestsSent: number; casesOpened: number; answersRead: number };
};

export type AgencyInsights = {
  range: RangeKey;
  generatedAt: string;
  window: { from: string; to: string };
  contact: {
    medianHours: number | null;
    insideTarget: number | null;
    cases: number;
    change: number | null;
    small: boolean;
  };
  needingCases: number;
  overdue: { value: number; previous: number };
  portfolio: Tile;
  answerRate: {
    value: number | null;
    change: number | null;
    sent: number;
    answered: number;
    small: boolean;
  };
  clients: {
    clientId: string;
    name: string;
    places: number;
    rating: number | null;
    change: number | null;
    spark: number[];
    responses: number;
    answerRate: number | null;
    overdue: number;
    pendingPlaces: number;
  }[];
  cases: {
    id: string;
    clientId: string;
    clientName: string;
    locationName: string;
    severity: string;
    summary: string;
    dueAt: string;
    overdue: boolean;
  }[];
};

export type QueueItem = {
  kind: "case" | "approval" | "account" | "place";
  id: string;
  client: string;
  place: string | null;
  detail: string;
  severity: string | null;
  dueAt: string | null;
  overdue: boolean;
  href: string;
};

export type AgencyOverview = AgencyInsights & {
  queue: QueueItem[];
  queueCounts: { cases: number; approvals: number; accounts: number; places: number };
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
  casesTable: (range: RangeKey, place?: string) =>
    call<CasesTable>(`/api/cases?${new URLSearchParams({ range, ...(place ? { place } : {}) })}`),
  casesBand: (range: RangeKey, place?: string) =>
    call<CasesBand>(
      `/api/insights/cases?${new URLSearchParams({ range, ...(place ? { place } : {}) })}`,
    ),
  responsesBand: (range: RangeKey, place?: string) =>
    call<ResponsesBand>(
      `/api/insights/responses?${new URLSearchParams({ range, ...(place ? { place } : {}) })}`,
    ),
  responsesPage: (query: ResponsesQuery) => {
    const params = new URLSearchParams();
    const put = (key: string, value: string | number | boolean | undefined) => {
      if (value === undefined || value === "" || value === false) return;
      params.set(key, value === true ? "1" : String(value));
    };
    put("range", query.range);
    put("place", query.place);
    put("page", query.page ?? 1);
    put("pageSize", query.pageSize);
    put("sort", query.sort);
    put("dir", query.dir);
    put("q", query.q);
    put("maxRating", query.maxRating);
    put("rating", query.rating);
    put("sentiment", query.sentiment);
    put("topic", query.topic);
    put("wantsContact", query.wantsContact);
    put("hasCase", query.hasCase);
    put("safety", query.safety);
    return call<ResponsesPage>(`/api/surveys/responses?${params}`);
  },
  insightsOwner: (range: RangeKey, place?: string) =>
    call<OwnerInsights>(
      `/api/insights/owner?${new URLSearchParams({ range, ...(place ? { place } : {}) })}`,
    ),
  insightsAgency: (range: RangeKey, client?: string) =>
    call<AgencyOverview>(
      `/api/insights/agency?${new URLSearchParams({ range, ...(client ? { client } : {}) })}`,
    ),
  detail: (id: string) => call<{ case: CaseDetail }>(`/api/cases/${id}`).then((r) => r.case),
  advance: (id: string, to: "contacted" | "resolved", note: string) =>
    call<{ case: CaseDetail }>(`/api/cases/${id}/advance`, {
      method: "POST",
      body: JSON.stringify({ to, note: note.trim() || null }),
    }).then((r) => r.case),
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
