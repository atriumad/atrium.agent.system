import { afterEach, describe, expect, test } from "bun:test";
import { AccountsApprovalsPage, ClientPlacesPage, PlacesApprovalsPage } from "../src/approvals-app";
import { CasesPage } from "../src/cases-app";
import { PlacesPage } from "../src/places-panel";
import { MeProvider } from "../src/shell/me-context";
import { OverviewPage } from "../src/shell/overview";
import { ModulePage } from "../src/shell/teaser";
import { FormsPage, HelpPage, HelpRequestsPage, ResponsesPage } from "../src/surveys-app";
import {
  agencyInsightsFixture,
  amMe,
  casesBandFixture,
  fakeFetch,
  meOf,
  ownerInsightsFixture,
  ownerMe,
  responsesBandFixture,
  responsesPageFixture,
  restoreFetch,
} from "./fake-api";
import { screen, setup } from "./helpers";

afterEach(() => {
  restoreFetch();
  window.history.replaceState({}, "", "/");
});

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const aCase = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  clientId: "c1",
  clientName: "Casa Olivo",
  locationId: "l1",
  locationName: `Bellaire ${id}`,
  severity: "high",
  status: "open",
  openedAt: hours(-2),
  dueAt: hours(20),
  rating: 1,
  wantsContact: true,
  ...over,
});
const aForm = (over: Record<string, unknown> = {}) => ({
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Bellaire",
  clientId: "c1",
  clientName: "Casa Olivo",
  reviewUrl: "https://g.page/r/abc/review",
  requestDelayMinutes: 120,
  qrVersion: 1,
  status: "active",
  qrUrl: "http://hub.test/q/x",
  ...over,
});

const inside = (me: typeof ownerMe, ui: React.ReactNode) =>
  setup(<MeProvider me={me}>{ui}</MeProvider>);

describe("pages carry no navigation chrome of their own", () => {
  test("the cases page lists cases without section links or an account block", async () => {
    fakeFetch({
      "/api/locations": { locations: [] },
      "/api/cases?range=30d": {
        cases: [{ ...aCase("a"), comment: null, topics: null, sentiment: null, safety: null }],
        counts: { active: 1, open: 1, contacted: 0, resolved: 0, all: 1 },
        truncated: false,
      },
      "/api/insights/cases?range=30d": casesBandFixture,
    });
    inside(amMe, <CasesPage surface="manager" />);
    expect((await screen.findAllByText(/Bellaire a/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  test("the responses page loads the answers", async () => {
    fakeFetch({
      "/api/locations": { locations: [] },
      "/api/surveys/responses?range=30d&page=1&pageSize=25&sort=date&dir=desc":
        responsesPageFixture,
      "/api/insights/responses?range=30d": responsesBandFixture,
    });
    inside(ownerMe, <ResponsesPage />);
    expect(await screen.findByText("Lovely, thank you.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Responses summary" })).toBeTruthy();
  });

  test("the forms page gives an owner generate-link but not rotate", async () => {
    fakeFetch({ "/api/surveys/forms": { forms: [aForm()] } });
    inside(ownerMe, <FormsPage />);
    expect(await screen.findByText("Generate link")).toBeTruthy();
    expect(screen.queryByText("Rotate QR")).toBeNull();
  });

  test("the forms page gives the agency every control", async () => {
    fakeFetch({ "/api/surveys/forms": { forms: [aForm()] } });
    inside(amMe, <FormsPage />);
    expect(await screen.findByText("Rotate QR")).toBeTruthy();
  });

  test("the agency's help requests page and the client's help page both open", async () => {
    fakeFetch({
      "/api/surveys/requests": { requests: [] },
      "/api/surveys/locations": {
        locations: [{ id: "l1", locationName: "Bellaire", clientName: "Casa Olivo" }],
      },
    });
    const first = inside(amMe, <HelpRequestsPage />);
    expect(await screen.findByText("No help requests")).toBeTruthy();
    first.unmount();
    inside(ownerMe, <HelpPage />);
    expect(await screen.findByText("Send request")).toBeTruthy();
  });

  test("the places page shows the owner's places", async () => {
    fakeFetch({
      "/api/locations": {
        locations: [
          {
            id: "l1",
            name: "Bellaire",
            clientId: "c1",
            clientName: "Casa Olivo",
            status: "active",
          },
        ],
      },
    });
    inside(ownerMe, <PlacesPage />);
    expect(await screen.findByText("Bellaire")).toBeTruthy();
    expect(screen.getByText("Add a place")).toBeTruthy();
  });

  test("the approvals pages list accounts and places", async () => {
    fakeFetch({
      "/api/onboarding/requests": { requests: [] },
      "/api/locations": {
        locations: [
          { id: "p1", name: "Patio", clientId: "c1", clientName: "Casa Olivo", status: "pending" },
        ],
      },
    });
    const first = inside(amMe, <AccountsApprovalsPage />);
    expect(await screen.findByText("No accounts waiting")).toBeTruthy();
    first.unmount();
    inside(amMe, <PlacesApprovalsPage />);
    expect(await screen.findByText("Patio")).toBeTruthy();
  });
});

/** What a notification's link does: the page opens on the thing it was about. */
describe("opening the thing a notification is about", () => {
  const visit = (search: string) => window.history.replaceState({}, "", `/${search}`);
  const detail = (id: string, over: Record<string, unknown> = {}) => ({
    ...aCase(id),
    contactedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    note: null,
    response: { bestPart: null, improve: null, comment: "The soup was cold", createdAt: hours(-3) },
    contact: null,
    ...over,
  });

  test("the help page opens the request named in the address", async () => {
    visit("?request=r1");
    const calls = fakeFetch({ "/api/surveys/requests": { requests: [] } });
    inside(amMe, <HelpRequestsPage />);
    await screen.findByText("No help requests");
    expect(calls.some((c) => c.path === "/api/surveys/requests/r1")).toBe(true);
  });

  test("the place named in the address is marked on the approvals page", async () => {
    visit("?place=p2");
    fakeFetch({
      "/api/locations": {
        locations: [
          { id: "p1", name: "Patio", clientId: "c", clientName: "Casa Olivo", status: "pending" },
          { id: "p2", name: "Heights", clientId: "c", clientName: "Casa Olivo", status: "pending" },
        ],
      },
    });
    inside(amMe, <PlacesApprovalsPage />);
    await screen.findByText("Heights");
    const marked = document.querySelectorAll('[aria-current="true"]');
    expect(marked.length).toBe(1);
    expect(marked[0]?.textContent).toContain("Heights");
  });

  test("the place named in the address is marked on the owner's places page", async () => {
    visit("?place=l2");
    fakeFetch({
      "/api/locations": {
        locations: [
          {
            id: "l1",
            name: "Bellaire",
            clientId: "c1",
            clientName: "Casa Olivo",
            status: "active",
          },
          { id: "l2", name: "Heights", clientId: "c1", clientName: "Casa Olivo", status: "active" },
        ],
      },
    });
    inside(ownerMe, <PlacesPage />);
    await screen.findByText("Heights");
    const marked = document.querySelectorAll('[aria-current="true"]');
    expect(marked.length).toBe(1);
    expect(marked[0]?.textContent).toContain("Heights");
  });
});

describe("module pages", () => {
  test("a locked module explains that it is not in the plan", async () => {
    fakeFetch({ "/api/access": { access: { retention: "locked" } } });
    inside(ownerMe, <ModulePage feature="retention" />);
    expect(await screen.findByText(/not part of your plan/i)).toBeTruthy();
  });

  test("a module that is open but not built says it is on its way", async () => {
    fakeFetch({ "/api/access": { access: { analytics: "full" } } });
    inside(ownerMe, <ModulePage feature="analytics" />);
    expect(await screen.findByText(/on its way/i)).toBeTruthy();
  });

  test("an unknown module says there is no such module", async () => {
    fakeFetch({ "/api/access": { access: {} } });
    inside(ownerMe, <ModulePage feature="nonsense" />);
    expect(await screen.findByText("No such module")).toBeTruthy();
  });
});

describe("overview", () => {
  test("a client sees how the business is doing and what is waiting on them", async () => {
    fakeFetch({
      "/api/locations": { locations: [] },
      "/api/insights/owner?range=30d": ownerInsightsFixture,
    });
    inside(ownerMe, <OverviewPage surface="platform" />);
    expect(await screen.findByText("Average rating")).toBeTruthy();
    const waiting = screen.getByText("Waiting on you").closest("a");
    expect(waiting?.getAttribute("href")).toBe("/reputation/feedback?status=overdue");
  });

  test("the agency sees what needs a person first", async () => {
    fakeFetch({
      "/api/locations": { locations: [] },
      "/api/insights/agency?range=30d": agencyInsightsFixture,
    });
    inside(amMe, <OverviewPage surface="manager" />);
    expect(await screen.findByText("Needs a person now")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open case/ }).getAttribute("href")).toBe(
      "/reputation/cases/k1",
    );
    expect(screen.getByText("Median time to contact")).toBeTruthy();
  });
});

describe("a page the role cannot use says so instead of failing", () => {
  const staff = meOf({ role: "client_staff", kind: "client", canReadSurveys: true });
  const agencyStaff = meOf({
    role: "agency_staff",
    kind: "assigned",
    canReadSurveys: true,
    canViewForms: true,
  });

  test("forms and help for a location manager", async () => {
    const calls = fakeFetch({});
    const first = inside(staff, <FormsPage />);
    expect(await screen.findByText("Not available for your role")).toBeTruthy();
    first.unmount();
    inside(staff, <HelpPage />);
    expect(await screen.findByText("Not available for your role")).toBeTruthy();
    expect(calls.some((c) => c.path.startsWith("/api/surveys/forms"))).toBe(false);
  });

  test("the approvals pages for someone who cannot decide", async () => {
    fakeFetch({ "/api/onboarding/requests": { requests: [] } });
    const first = inside(agencyStaff, <AccountsApprovalsPage />);
    expect(await screen.findByText("Not available for your role")).toBeTruthy();
    first.unmount();
    fakeFetch({
      "/api/locations": {
        locations: [
          { id: "p", name: "Patio", clientId: "c", clientName: "Casa Olivo", status: "pending" },
        ],
      },
    });
    inside(agencyStaff, <ClientPlacesPage />);
    expect(await screen.findByText("Patio")).toBeTruthy();
    expect(screen.queryByText("Approve place")).toBeNull();
    expect(screen.queryByText("Pause")).toBeNull();
  });
});
