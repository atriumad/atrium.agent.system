import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type AtriumEvent, SurveySubmission } from "@atrium/contracts";
import {
  assignClient,
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  eraseGuest,
  listNotifications,
  recordConsent,
  recordOptOut,
  resolveGuest,
  type Scope,
  setPackage,
  withAgency,
  withScope,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  advanceCase,
  CaseForbiddenError,
  CaseTransitionError,
  classifyResponse,
  DeviceLimitError,
  InvalidSubmissionError,
  InvitationUnavailableError,
  listCases,
  listDueReviewRequests,
  openCase,
  recordReviewClick,
  resolveInvitation,
  scheduleReviewRequest,
  scrubErasedGuest,
  sendReviewRequest,
  submitSurvey,
  updateLocationSettings,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `rep-admin-${suffix}` } as const;
const REVIEW_URL = "https://search.google.com/local/writereview?placeid=TEST";
const BASE = "https://survey.example.test";
// A Tuesday at 12:00 in Chicago (CDT): a daytime moment, so quiet hours never interfere.
const NOW = new Date("2026-10-06T17:00:00Z");
const deps = { now: () => NOW };

let a: string;
let b: string;
let locA: string;
let locB: string;
let ownerId: string;
let amId: string;
let staffId: string;
let orgs: { agency: string; client: string };

const events: AtriumEvent[] = [];
const publish = async (e: AtriumEvent) => void events.push(e);
const eventsOf = (type: string) => events.filter((e) => e.type === type);

const inA = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, a, fn);
const email = (n: string) => `${n}-${suffix}@guest.test`;

async function guestWithConsent(
  name: string,
  opts: { email?: boolean; sms?: boolean } = { email: true },
) {
  return inA(async (tx) => {
    const id = await resolveGuest(tx, a, {
      email: email(name),
      ...(opts.sms ? { phone: `713-555-${String(Math.floor(1000 + Math.random() * 8999))}` } : {}),
    });
    if (opts.email) await recordConsent(tx, id, "email", "marketing", "qr");
    if (opts.sms) await recordConsent(tx, id, "sms", "marketing", "qr");
    return id;
  });
}

const submission = (overrides: Record<string, unknown> = {}) =>
  SurveySubmission.parse({ rating: 5, ...overrides });

async function sentInvitation(name: string) {
  const guestId = await guestWithConsent(name);
  const requestId = await inA(async (tx) => {
    await scheduleReviewRequest(
      tx,
      { clientId: a, locationId: locA, guestId, visitDate: "2026-10-06" },
      deps,
    );
    const [row] = await tx.execute<{ id: string }>(
      sql`select id from reputation.review_requests where guest_id = ${guestId}`,
    );
    return row?.id as string;
  });
  await inA((tx) =>
    sendReviewRequest(tx, requestId, { publicBaseUrl: BASE }, { ...deps, publish }),
  );
  const [note] = (await admin.unsafe(
    "select body from core.notifications where client_id = $1 and kind = 'reputation.review_request' and recipient_id = $2",
    [a, guestId],
  )) as { body: string }[];
  const token = note?.body.match(/\/s\/(svy_[A-Za-z0-9_-]+)/)?.[1] as string;
  return { guestId, requestId, token };
}

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    const agency = await createAgencyOrganization(tx, {
      name: "Atrium",
      slug: `atrium-rp-${suffix}`,
    });
    const ca = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `rp-olivo-${suffix}`,
    });
    const cb = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `rp-brasa-${suffix}`,
    });
    a = ca.client.id;
    b = cb.client.id;
    locA = (
      await createLocation(tx, a, { name: "Casa Olivo Bellaire", timeZone: "America/Chicago" })
    ).id;
    locB = (await createLocation(tx, b, { name: "Brasa Norte", timeZone: "America/Chicago" })).id;
    await setPackage(tx, a, "pillar_3", actor);
    await updateLocationSettings(
      tx,
      a,
      locA,
      { reviewUrl: REVIEW_URL, requestDelayMinutes: 60 },
      actor,
    );
    orgs = { agency: agency.id, client: ca.organization.id };
  });

  // The organizations are committed now, so the owner connection can see them.
  ownerId = `rp-owner-${suffix}`;
  amId = `rp-am-${suffix}`;
  staffId = `rp-staff-${suffix}`;
  for (const [id, org, role] of [
    [ownerId, orgs.client, "client_owner"],
    [amId, orgs.agency, "account_manager"],
    [staffId, orgs.client, "client_staff"],
  ] as const) {
    await admin.unsafe("insert into core.users (id, name, email) values ($1, $1, $2)", [
      id,
      `${id}@team.test`,
    ]);
    await admin.unsafe(
      "insert into core.members (id, organization_id, user_id, role) values ($1, $2, $3, $4)",
      [crypto.randomUUID(), org, id, role],
    );
  }
  await withAgency(db, (tx) => assignClient(tx, amId, a, actor));
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`rp-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.unsafe("delete from core.users where id like $1", [`rp-%-${suffix}`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("scheduling a review request", () => {
  test("schedules it after the location's delay", async () => {
    const guestId = await guestWithConsent("sched");
    const outcome = await inA((tx) =>
      scheduleReviewRequest(
        tx,
        { clientId: a, locationId: locA, guestId, visitDate: "2026-10-06" },
        deps,
      ),
    );
    expect(outcome).toEqual({ status: "scheduled", sendAt: new Date("2026-10-06T18:00:00Z") });
  });

  test("a redelivered visit schedules nothing new", async () => {
    const guestId = await guestWithConsent("dup");
    const input = { clientId: a, locationId: locA, guestId, visitDate: "2026-10-06" };
    const first = await inA((tx) => scheduleReviewRequest(tx, input, deps));
    const second = await inA((tx) => scheduleReviewRequest(tx, input, deps));
    expect(first.status).toBe("scheduled");
    expect(second).toEqual({ status: "duplicate" });
  });

  test("a stale visit is recorded as skipped, and is not retried", async () => {
    const guestId = await guestWithConsent("stale");
    const input = { clientId: a, locationId: locA, guestId, visitDate: "2026-10-01" };
    expect(await inA((tx) => scheduleReviewRequest(tx, input, deps))).toEqual({
      status: "skipped",
      reason: "stale_visit",
    });
    expect(await inA((tx) => scheduleReviewRequest(tx, input, deps))).toEqual({
      status: "skipped",
      reason: "stale_visit",
    });
    const rows = await inA((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from reputation.review_requests where guest_id = ${guestId}`,
      ),
    );
    expect(rows[0]?.n).toBe(1);
  });

  test("a location with no review link sends nothing, since the request would end nowhere", async () => {
    const other = await withAgency(
      db,
      async (tx) =>
        (await createLocation(tx, a, { name: "No link", timeZone: "America/Chicago" })).id,
    );
    const guestId = await guestWithConsent("nolink");
    expect(
      await inA((tx) =>
        scheduleReviewRequest(
          tx,
          { clientId: a, locationId: other, guestId, visitDate: "2026-10-06" },
          deps,
        ),
      ),
    ).toEqual({ status: "skipped", reason: "no_review_url" });
  });

  test("a location that is not the client's is skipped without a trace", async () => {
    const guestId = await guestWithConsent("foreign");
    expect(
      await inA((tx) =>
        scheduleReviewRequest(
          tx,
          { clientId: a, locationId: locB, guestId, visitDate: "2026-10-06" },
          deps,
        ),
      ),
    ).toEqual({ status: "skipped", reason: "unknown_location" });
  });

  test("a request lands in the queue only when its time has come", async () => {
    const early = await withAgency(db, (tx) =>
      listDueReviewRequests(tx, new Date("2026-10-06T17:59:00Z")),
    );
    const late = await withAgency(db, (tx) =>
      listDueReviewRequests(tx, new Date("2026-10-06T18:01:00Z")),
    );
    const ids = (r: { clientId: string }[]) => r.filter((x) => x.clientId === a).length;
    expect(ids(late)).toBeGreaterThan(ids(early));
  });
});

describe("sending a review request", () => {
  test("sends a single-use link to a guest who agreed, and tells the world once", async () => {
    const before = eventsOf("survey.sent").length;
    const { token, requestId } = await sentInvitation("sendok");
    expect(token).toMatch(/^svy_/);
    const [req] = (await admin.unsafe(
      "select status, invitation_id from reputation.review_requests where id = $1",
      [requestId],
    )) as { status: string; invitation_id: string | null }[];
    expect(req).toMatchObject({ status: "sent" });
    expect(req?.invitation_id).not.toBeNull();
    expect(eventsOf("survey.sent").length).toBe(before + 1);
    const resolved = await resolveInvitation(db, token, NOW);
    expect(resolved.ok).toBe(true);
  });

  test("the outbox keeps a masked address and the link is the only thing a guest needs", async () => {
    const { guestId } = await sentInvitation("masked");
    const [note] = (await admin.unsafe(
      "select to_masked, subject, body from core.notifications where recipient_id = $1",
      [guestId],
    )) as { to_masked: string; subject: string; body: string }[];
    expect(note?.to_masked).toMatch(/^m\*\*\*@guest\.test$/);
    expect(note?.subject).toContain("Casa Olivo Bellaire");
    expect(note?.body).toContain(`${BASE}/s/svy_`);
    expect(note?.body).not.toContain(email("masked"));
  });

  test("no consent means no message and no invitation", async () => {
    const guestId = await guestWithConsent("noconsent", {});
    const requestId = await inA(async (tx) => {
      await scheduleReviewRequest(
        tx,
        { clientId: a, locationId: locA, guestId, visitDate: "2026-10-06" },
        deps,
      );
      return (
        (
          await tx.execute<{ id: string }>(
            sql`select id from reputation.review_requests where guest_id = ${guestId}`,
          )
        )[0] as { id: string }
      ).id;
    });
    const result = await inA((tx) =>
      sendReviewRequest(tx, requestId, { publicBaseUrl: BASE }, deps),
    );
    expect(result).toEqual({ outcome: "skipped", reason: "no_consent" });
    const invs = await inA((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from reputation.survey_invitations where guest_id = ${guestId}`,
      ),
    );
    expect(invs[0]?.n).toBe(0);
  });

  test("an opt-out is respected", async () => {
    const guestId = await guestWithConsent("optout");
    await inA((tx) => recordOptOut(tx, guestId, "email", "email_unsubscribe"));
    const requestId = await inA(async (tx) => {
      await scheduleReviewRequest(
        tx,
        { clientId: a, locationId: locA, guestId, visitDate: "2026-10-06" },
        deps,
      );
      return (
        (
          await tx.execute<{ id: string }>(
            sql`select id from reputation.review_requests where guest_id = ${guestId}`,
          )
        )[0] as { id: string }
      ).id;
    });
    expect(
      await inA((tx) => sendReviewRequest(tx, requestId, { publicBaseUrl: BASE }, deps)),
    ).toEqual({ outcome: "skipped", reason: "opted_out" });
  });

  test("a guest who only agreed to SMS is not texted while SMS is not enabled for the client", async () => {
    const guestId = await guestWithConsent("smsonly", { sms: true });
    await inA((tx) => recordOptOut(tx, guestId, "email", "email_unsubscribe"));
    const requestId = await inA(async (tx) => {
      await scheduleReviewRequest(
        tx,
        { clientId: a, locationId: locA, guestId, visitDate: "2026-10-06" },
        deps,
      );
      return (
        (
          await tx.execute<{ id: string }>(
            sql`select id from reputation.review_requests where guest_id = ${guestId}`,
          )
        )[0] as { id: string }
      ).id;
    });
    const result = await inA((tx) =>
      sendReviewRequest(tx, requestId, { publicBaseUrl: BASE }, deps),
    );
    expect(result.outcome).toBe("skipped");
  });

  test("handling a request twice sends one message", async () => {
    const { requestId } = await sentInvitation("twice");
    const before = (await inA((tx) => listNotifications(tx, a, 200))).length;
    expect(
      await inA((tx) => sendReviewRequest(tx, requestId, { publicBaseUrl: BASE }, deps)),
    ).toEqual({ outcome: "already_handled" });
    expect((await inA((tx) => listNotifications(tx, a, 200))).length).toBe(before);
  });

  test("a client cannot send another client's request", async () => {
    const { requestId } = await sentInvitation("cross");
    const result = await withTenant(db, b, (tx) =>
      sendReviewRequest(tx, requestId, { publicBaseUrl: BASE }, deps),
    );
    expect(result).toEqual({ outcome: "already_handled" });
  });
});

describe("the survey", () => {
  test("an unknown, malformed, expired or used link is refused with its reason", async () => {
    expect(await resolveInvitation(db, "svy_nothing-like-it", NOW)).toEqual({
      ok: false,
      reason: "unknown",
    });
    expect(await resolveInvitation(db, "garbage", NOW)).toEqual({ ok: false, reason: "unknown" });
    const { token } = await sentInvitation("states");
    expect(await resolveInvitation(db, token, new Date("2026-10-14T00:00:00Z"))).toEqual({
      ok: false,
      reason: "expired",
    });
    await submitSurvey(db, { kind: "invitation", token }, submission(), deps);
    expect(await resolveInvitation(db, token, NOW)).toEqual({ ok: false, reason: "used" });
  });

  test("a response is stored with the guest, announced, and the link works once", async () => {
    const { token, guestId } = await sentInvitation("answers");
    const before = eventsOf("survey.response.submitted").length;
    const result = await submitSurvey(
      db,
      { kind: "invitation", token },
      submission({ rating: 4, bestPart: "food", improve: "speed", comment: "Great tacos" }),
      { ...deps, publish },
    );
    expect(result.reviewUrl).toBe(REVIEW_URL);
    const [row] = await inA((tx) =>
      tx.execute<{ guest_id: string; rating: number; comment: string }>(
        sql`select guest_id, rating, comment from reputation.survey_responses where id = ${result.responseId}`,
      ),
    );
    expect(row).toMatchObject({ guest_id: guestId, rating: 4, comment: "Great tacos" });
    expect(eventsOf("survey.response.submitted").length).toBe(before + 1);
    await expect(
      submitSurvey(db, { kind: "invitation", token }, submission(), deps),
    ).rejects.toBeInstanceOf(InvitationUnavailableError);
  });

  test("everyone gets the Google button, whatever they rated", async () => {
    for (const rating of [1, 3, 5]) {
      const { token } = await sentInvitation(`everyone${rating}`);
      const result = await submitSurvey(
        db,
        { kind: "invitation", token },
        submission({ rating }),
        deps,
      );
      expect(result.reviewUrl).toBe(REVIEW_URL);
    }
  });

  test("two people opening the same link at once produce one response", async () => {
    const { token } = await sentInvitation("race");
    const results = await Promise.allSettled([
      submitSurvey(db, { kind: "invitation", token }, submission(), deps),
      submitSurvey(db, { kind: "invitation", token }, submission({ rating: 2 }), deps),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason,
    ).toBeInstanceOf(InvitationUnavailableError);
  });

  test("a QR response is anonymous and limited to one per device", async () => {
    const source = (deviceHash: string) =>
      ({ kind: "qr", clientId: a, locationId: locA, deviceHash }) as const;
    const first = await submitSurvey(
      db,
      source(`dev-1-${suffix}`),
      submission({ rating: 3 }),
      deps,
    );
    const [row] = await inA((tx) =>
      tx.execute<{ guest_id: string | null; invitation_id: string | null }>(
        sql`select guest_id, invitation_id from reputation.survey_responses where id = ${first.responseId}`,
      ),
    );
    expect(row).toEqual({ guest_id: null, invitation_id: null });
    await expect(
      submitSurvey(db, source(`dev-1-${suffix}`), submission(), deps),
    ).rejects.toBeInstanceOf(DeviceLimitError);
    await expect(
      submitSurvey(db, source(`dev-2-${suffix}`), submission(), deps),
    ).resolves.toBeDefined();
    const later = { now: () => new Date(NOW.getTime() + 13 * 3_600_000) };
    await expect(
      submitSurvey(db, source(`dev-1-${suffix}`), submission(), later),
    ).resolves.toBeDefined();
  });

  test("asking to be contacted turns contact details into a guest with a consent", async () => {
    const result = await submitSurvey(
      db,
      { kind: "qr", clientId: a, locationId: locA, deviceHash: `dev-c-${suffix}` },
      submission({
        rating: 2,
        wantsContact: true,
        contactEmail: email("contact"),
        contactName: "Dana",
      }),
      deps,
    );
    const [row] = await inA((tx) =>
      tx.execute<{ guest_id: string }>(
        sql`select guest_id from reputation.survey_responses where id = ${result.responseId}`,
      ),
    );
    expect(row?.guest_id).toBeString();
    const consents = await admin.unsafe(
      "select channel, purpose, source, granted from core.consents where guest_id = $1",
      [row?.guest_id],
    );
    expect(consents).toEqual([
      { channel: "email", purpose: "transactional", source: "survey", granted: true },
    ]);
    const raw = await admin.unsafe("select * from reputation.survey_responses where id = $1", [
      result.responseId,
    ]);
    expect(JSON.stringify(raw)).not.toContain(email("contact"));
  });

  test("contact details are ignored unless the guest asked to be contacted", async () => {
    const result = await submitSurvey(
      db,
      { kind: "qr", clientId: a, locationId: locA, deviceHash: `dev-n-${suffix}` },
      submission({ rating: 4, wantsContact: false, contactEmail: email("ignored") }),
      deps,
    );
    const [row] = await inA((tx) =>
      tx.execute<{ guest_id: string | null }>(
        sql`select guest_id from reputation.survey_responses where id = ${result.responseId}`,
      ),
    );
    expect(row?.guest_id).toBeNull();
    const guests = await admin.unsafe("select 1 from core.guest_identifiers where value = $1", [
      email("ignored"),
    ]);
    expect(guests).toHaveLength(0);
  });

  test("a bad contact is reported and does not burn the guest's link", async () => {
    const { token } = await sentInvitation("badcontact");
    await expect(
      submitSurvey(
        db,
        { kind: "invitation", token },
        submission({ wantsContact: true, contactEmail: "not-an-email" }),
        deps,
      ),
    ).rejects.toBeInstanceOf(InvalidSubmissionError);
    expect((await resolveInvitation(db, token, NOW)).ok).toBe(true);
    await expect(
      submitSurvey(db, { kind: "invitation", token }, submission(), deps),
    ).resolves.toBeDefined();
  });

  test("the review button is recorded the first time it is tapped, and goes to the link", async () => {
    const { token } = await sentInvitation("click");
    const { responseId } = await submitSurvey(
      db,
      { kind: "invitation", token },
      submission(),
      deps,
    );
    const before = eventsOf("review.link.clicked").length;
    expect(await recordReviewClick(db, responseId, { ...deps, publish })).toBe(REVIEW_URL);
    expect(await recordReviewClick(db, responseId, { ...deps, publish })).toBe(REVIEW_URL);
    expect(eventsOf("review.link.clicked").length).toBe(before + 1);
    expect(await recordReviewClick(db, crypto.randomUUID(), deps)).toBeNull();
  });
});

describe("recovery", () => {
  const respond = async (name: string, overrides: Record<string, unknown>) => {
    const { token } = await sentInvitation(name);
    return (await submitSurvey(db, { kind: "invitation", token }, submission(overrides), deps))
      .responseId;
  };
  const owner: Scope = { kind: "client", userId: "owner", role: "client_owner", clientId: "" };

  test("a poor rating is high severity and needs a case; a happy one does not", async () => {
    const poor = await respond("poor", { rating: 1 });
    const happy = await respond("happy", { rating: 5 });
    expect(await inA((tx) => classifyResponse(tx, poor))).toEqual({
      severity: "high",
      shouldOpen: true,
    });
    expect(await inA((tx) => classifyResponse(tx, happy))).toEqual({
      severity: null,
      shouldOpen: false,
    });
  });

  test("an anonymous request to be contacted, with no details, opens nothing on its own", async () => {
    const { responseId } = await submitSurvey(
      db,
      { kind: "qr", clientId: a, locationId: locA, deviceHash: `dev-w-${suffix}` },
      submission({ rating: 5, wantsContact: true }),
      deps,
    );
    expect(await inA((tx) => classifyResponse(tx, responseId))).toEqual({
      severity: "low",
      shouldOpen: false,
    });
  });

  test("a case is opened once, due in 24 hours, and the owner and the assigned manager are told", async () => {
    const responseId = await respond("case1", { rating: 2, comment: "Long wait" });
    const before = eventsOf("recovery.case.opened").length;
    const first = await inA((tx) =>
      openCase(
        tx,
        { responseId, severity: "medium", reason: "rating 2" },
        { adminBaseUrl: "https://admin.example.test" },
        { ...deps, publish },
      ),
    );
    expect(first).toMatchObject({ created: true, alerted: 2 });
    const [c] = await inA((tx) =>
      tx.execute<{ due_at: Date; status: string }>(
        sql`select due_at, status from reputation.recovery_cases where id = ${first.caseId}`,
      ),
    );
    expect(c?.status).toBe("open");
    expect(new Date(c?.due_at as Date).toISOString()).toBe("2026-10-07T17:00:00.000Z");
    expect(eventsOf("recovery.case.opened").length).toBe(before + 1);

    const alerts = (await admin.unsafe(
      "select recipient_id, body from core.notifications where kind = 'reputation.case_alert' and body like $1",
      [`%${first.caseId}%`],
    )) as { recipient_id: string; body: string }[];
    expect(alerts.map((x) => x.recipient_id).sort()).toEqual([amId, ownerId].sort());
    expect(alerts[0]?.body).toContain(`https://admin.example.test/admin/cases/${first.caseId}`);

    const again = await inA((tx) =>
      openCase(tx, { responseId, severity: "medium", reason: "again" }, {}, { ...deps, publish }),
    );
    expect(again).toEqual({ caseId: first.caseId, created: false, alerted: 0 });
    expect(eventsOf("recovery.case.opened").length).toBe(before + 1);
  });

  test("a more serious reading raises an existing case and tells the people again; never lowers", async () => {
    const responseId = await respond("raise1", { rating: 2, comment: "Long wait" });
    const opened = await inA((tx) =>
      openCase(
        tx,
        { responseId, severity: "medium", reason: "rating 2" },
        {},
        { ...deps, publish },
      ),
    );
    const before = eventsOf("recovery.case.opened").length;
    const sevOf = async () =>
      (
        (await admin.unsafe("select severity from reputation.recovery_cases where id = $1", [
          opened.caseId,
        ])) as { severity: string }[]
      )[0]?.severity;

    const same = await inA((tx) =>
      openCase(tx, { responseId, severity: "medium", reason: "same" }, {}, { ...deps, publish }),
    );
    expect(same).toEqual({ caseId: opened.caseId, created: false, alerted: 0 });
    const lower = await inA((tx) =>
      openCase(tx, { responseId, severity: "low", reason: "lower" }, {}, { ...deps, publish }),
    );
    expect(lower.alerted).toBe(0);
    expect(await sevOf()).toBe("medium");

    const raised = await inA((tx) =>
      openCase(tx, { responseId, severity: "high", reason: "poison" }, {}, { ...deps, publish }),
    );
    expect(raised.caseId).toBe(opened.caseId);
    expect(raised.created).toBe(false);
    expect(raised.alerted).toBeGreaterThan(0);
    expect(await sevOf()).toBe("high");
    expect(eventsOf("recovery.case.opened").length).toBe(before);
    const subjects = (await admin.unsafe(
      "select subject from core.notifications where kind = 'reputation.case_alert' and subject like '%raised to high%'",
    )) as { subject: string }[];
    expect(subjects.length).toBeGreaterThan(0);

    const lowerAgain = await inA((tx) =>
      openCase(tx, { responseId, severity: "medium", reason: "lower" }, {}, deps),
    );
    expect(lowerAgain.alerted).toBe(0);
    expect(await sevOf()).toBe("high");
  });

  test("a resolved case is not raised", async () => {
    const responseId = await respond("raise2", { rating: 2, comment: "Long wait" });
    const opened = await inA((tx) =>
      openCase(tx, { responseId, severity: "medium", reason: "rating 2" }, {}, deps),
    );
    await admin.unsafe(
      "update reputation.recovery_cases set status = 'resolved', resolved_at = now() where id = $1",
      [opened.caseId],
    );
    const result = await inA((tx) =>
      openCase(tx, { responseId, severity: "high", reason: "late" }, {}, deps),
    );
    expect(result).toEqual({ caseId: opened.caseId, created: false, alerted: 0 });
    const [c] = (await admin.unsafe(
      "select severity from reputation.recovery_cases where id = $1",
      [opened.caseId],
    )) as { severity: string }[];
    expect(c?.severity).toBe("medium");
  });

  test("the team works a case from open to resolved; the owner and staff cannot", async () => {
    const responseId = await respond("case2", { rating: 1 });
    const { caseId } = await inA((tx) =>
      openCase(tx, { responseId, severity: "high", reason: "rating 1" }, {}, deps),
    );
    const am: Scope = { kind: "assigned", userId: amId, role: "account_manager" };
    const run = <T>(scope: Scope, fn: Parameters<typeof withScope<T>>[2]) =>
      withScope(db, scope, fn);

    await expect(
      run({ ...owner, clientId: a }, (tx) =>
        advanceCase(tx, { ...owner, clientId: a }, caseId, "contacted", null, deps),
      ),
    ).rejects.toBeInstanceOf(CaseForbiddenError);
    const staff: Scope = { kind: "client", userId: staffId, role: "client_staff", clientId: a };
    await expect(
      run(staff, (tx) => advanceCase(tx, staff, caseId, "contacted", null, deps)),
    ).rejects.toBeInstanceOf(CaseForbiddenError);

    const contacted = await run(am, (tx) =>
      advanceCase(tx, am, caseId, "contacted", "Called the guest", deps),
    );
    expect(contacted.status).toBe("contacted");
    const resolvedNotes = async () =>
      (await admin.unsafe(
        "select recipient_id from core.notifications where kind = 'reputation.case_resolved'",
      )) as { recipient_id: string }[];
    expect(await resolvedNotes()).toEqual([]);
    const before = eventsOf("recovery.case.resolved").length;
    const resolved = await run(am, (tx) =>
      advanceCase(tx, am, caseId, "resolved", "Comped the dessert", { ...deps, publish }),
    );
    // The owner is told it closed; the person who closed it is not told about their own act.
    expect((await resolvedNotes()).map((n) => n.recipient_id)).toEqual([ownerId]);
    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedBy: amId,
      note: "Comped the dessert",
    });
    expect(eventsOf("recovery.case.resolved").length).toBe(before + 1);
    await expect(
      run(am, (tx) => advanceCase(tx, am, caseId, "contacted", null, deps)),
    ).rejects.toBeInstanceOf(CaseTransitionError);
  });

  test("a case can be resolved without contact", async () => {
    const responseId = await respond("case3", { rating: 3 });
    const { caseId } = await inA((tx) =>
      openCase(tx, { responseId, severity: "low", reason: "rating 3" }, {}, deps),
    );
    const am: Scope = { kind: "assigned", userId: amId, role: "account_manager" };
    const resolved = await withScope(db, am, (tx) =>
      advanceCase(tx, am, caseId, "resolved", null, deps),
    );
    expect(resolved.status).toBe("resolved");
  });

  test("another client's team never sees the case", async () => {
    const responseId = await respond("case4", { rating: 1 });
    await inA((tx) => openCase(tx, { responseId, severity: "high", reason: "x" }, {}, deps));
    expect(await withTenant(db, b, (tx) => listCases(tx, a))).toEqual([]);
    const raw = await withTenant(db, b, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from reputation.recovery_cases`),
    );
    expect(raw[0]?.n).toBe(0);
  });
});

describe("erasure", () => {
  test("a guest's answers lose their name, comment and pending requests, but keep their rating", async () => {
    const { token, guestId } = await sentInvitation("erase");
    const { responseId } = await submitSurvey(
      db,
      { kind: "invitation", token },
      submission({ rating: 2, comment: "My name is Dana Lopez" }),
      deps,
    );
    await inA((tx) => openCase(tx, { responseId, severity: "medium", reason: "x" }, {}, deps));
    await inA((tx) =>
      scheduleReviewRequest(
        tx,
        { clientId: a, locationId: locA, guestId, visitDate: "2026-10-07" },
        deps,
      ),
    );

    await inA(async (tx) => {
      await eraseGuest(tx, guestId);
      await scrubErasedGuest(tx, guestId);
    });
    const [r] = await inA((tx) =>
      tx.execute<{ guest_id: string | null; comment: string | null; rating: number }>(
        sql`select guest_id, comment, rating from reputation.survey_responses where id = ${responseId}`,
      ),
    );
    expect(r).toEqual({ guest_id: null, comment: null, rating: 2 });
    const pending = await inA((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from reputation.review_requests where guest_id = ${guestId}`,
      ),
    );
    expect(pending[0]?.n).toBe(0);
    const [c] = await inA((tx) =>
      tx.execute<{ guest_id: string | null }>(
        sql`select guest_id from reputation.recovery_cases where response_id = ${responseId}`,
      ),
    );
    expect(c?.guest_id).toBeNull();
  });
});

describe("isolation in the database", () => {
  test("a client sees none of another client's responses, requests or invitations", async () => {
    for (const table of [
      "survey_responses",
      "review_requests",
      "survey_invitations",
      "recovery_cases",
      "location_settings",
    ]) {
      const rows = await withTenant(db, b, (tx) =>
        tx.execute<{ n: number }>(sql.raw(`select count(*)::int as n from reputation.${table}`)),
      );
      expect(rows[0]?.n).toBe(0);
    }
  });

  test("with no scope there is nothing to read", async () => {
    const rows = await db.transaction((tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from reputation.survey_responses`),
    );
    expect(rows[0]?.n).toBe(0);
  });

  test("a client cannot write a response for another client", async () => {
    await expect(
      withTenant(db, b, (tx) =>
        tx.execute(
          sql`insert into reputation.survey_responses (client_id, location_id, rating) values (${a}, ${locA}, 5)`,
        ),
      ),
    ).rejects.toThrow();
  });

  test("the review link must be https", async () => {
    await expect(
      withAgency(db, (tx) =>
        updateLocationSettings(tx, a, locA, { reviewUrl: "http://insecure.example" }, actor),
      ),
    ).rejects.toThrow("https");
    await expect(
      withAgency(db, (tx) =>
        updateLocationSettings(tx, a, locA, { requestDelayMinutes: -5 }, actor),
      ),
    ).rejects.toThrow("0 to 10080");
  });
});
