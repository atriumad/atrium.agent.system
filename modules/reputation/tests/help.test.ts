import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type AtriumEvent, SurveySubmission } from "@atrium/contracts";
import {
  assignClient,
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  type Scope,
  setPackage,
  withAgency,
  withScope,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  closeRequest,
  createSurveyRequest,
  getThread,
  HelpAttachmentError,
  listPickableResponses,
  listSurveyRequests,
  postMessage,
  SurveyForbiddenError,
  SurveyNotFoundError,
  SurveyStateError,
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
const actor = { type: "user", id: `help-admin-${suffix}` } as const;
const NOW = new Date("2026-10-06T17:00:00Z");
const events: AtriumEvent[] = [];
const deps = { now: () => NOW, publish: async (e: AtriumEvent) => void events.push(e) };

let a = "";
let b = "";
let locA = "";
let locA2 = "";
let locB = "";
const ids = { ownerA: "", ownerB: "", am: "", staff: "", agencyAdmin: "" };
let device = 0;

const ownerA = (): Scope => ({
  kind: "client",
  userId: ids.ownerA,
  role: "client_owner",
  clientId: a,
});
const ownerB = (): Scope => ({
  kind: "client",
  userId: ids.ownerB,
  role: "client_owner",
  clientId: b,
});
const am = (): Scope => ({ kind: "assigned", userId: ids.am, role: "account_manager" });
const staff = (): Scope => ({ kind: "assigned", userId: ids.staff, role: "agency_staff" });
const agencyAdmin = (): Scope => ({
  kind: "agency",
  userId: ids.agencyAdmin,
  role: "agency_admin",
});
const clientStaff = (): Scope => ({
  kind: "client",
  userId: `help-cstaff-${suffix}`,
  role: "client_staff",
  clientId: a,
  locationIds: [locA],
});
const as = <T>(scope: Scope, fn: Parameters<typeof withScope<T>>[2]) => withScope(db, scope, fn);

const respond = async (clientId: string, locationId: string, overrides: Record<string, unknown>) =>
  (
    await submitSurvey(
      db,
      { kind: "qr", clientId, locationId, deviceHash: `dev-help-${suffix}-${device++}` },
      SurveySubmission.parse({ rating: 2, ...overrides }),
      deps,
    )
  ).responseId;

const open = async (note = "I need help with my Google link") =>
  as(ownerA(), (tx) =>
    createSurveyRequest(tx, ownerA(), "Olivia Owner", { locationId: locA, note }, deps),
  );

const notesTo = async (userId: string) =>
  (await admin.unsafe(
    "select subject, body from core.notifications where kind = 'reputation.help_message' and recipient_id = $1 order by created_at",
    [userId],
  )) as { subject: string; body: string }[];

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let orgA = "";
  let orgB = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (
      await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-help-${suffix}` })
    ).id;
    const ca = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `help-a-${suffix}`,
    });
    const cb = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `help-b-${suffix}`,
    });
    a = ca.client.id;
    b = cb.client.id;
    orgA = ca.organization.id;
    orgB = cb.organization.id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
    locA2 = (await createLocation(tx, a, { name: "Heights", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, b, { name: "Norte", timeZone: "America/Chicago" })).id;
    await setPackage(tx, a, "pillar_3", actor);
    await setPackage(tx, b, "pillar_3", actor);
    for (const [c, l] of [
      [a, locA],
      [a, locA2],
      [b, locB],
    ] as const) {
      await updateLocationSettings(
        tx,
        c,
        l,
        { reviewUrl: "https://g.page/r/test/review", requestDelayMinutes: 60 },
        actor,
      );
    }
  });
  ids.ownerA = `help-ownerA-${suffix}`;
  ids.ownerB = `help-ownerB-${suffix}`;
  ids.am = `help-am-${suffix}`;
  ids.staff = `help-staff-${suffix}`;
  ids.agencyAdmin = `help-admin2-${suffix}`;
  for (const [id, org, role] of [
    [ids.ownerA, orgA, "client_owner"],
    [ids.ownerB, orgB, "client_owner"],
    [ids.am, agencyOrg, "account_manager"],
    [ids.staff, agencyOrg, "agency_staff"],
    [ids.agencyAdmin, agencyOrg, "agency_admin"],
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
  await withAgency(db, (tx) => assignClient(tx, ids.am, a, actor));
  await withAgency(db, (tx) => assignClient(tx, ids.staff, a, actor));
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`help-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.unsafe("delete from core.users where id like $1", [`help-%-${suffix}`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`help-%-${suffix}`]);
  await admin.close();
  await close();
});

describe("opening and reading a thread", () => {
  test("a new request is a thread with the owner's note as the first message, and tells the agency", async () => {
    const id = await open("Please change our link");
    const thread = await as(am(), (tx) => getThread(tx, am(), id));
    expect(thread.messages.map((m) => [m.side, m.body, m.authorName])).toEqual([
      ["client", "Please change our link", "Olivia Owner"],
    ]);
    expect(thread.request).toMatchObject({
      status: "open",
      awaiting: "agency",
      lastAuthorSide: "client",
      lastPreview: "Please change our link",
    });
    expect((await notesTo(ids.am)).some((n) => n.body.includes("Please change our link"))).toBe(
      true,
    );
    expect(await notesTo(ids.ownerA)).toEqual([]);
  });

  test("the owner can open a thread with a survey response attached", async () => {
    const responseId = await respond(a, locA, { comment: "Cold food" });
    const id = await as(ownerA(), (tx) =>
      createSurveyRequest(
        tx,
        ownerA(),
        "Olivia Owner",
        {
          locationId: locA,
          note: "What is this?",
          attachment: { kind: "response", responseId },
        },
        deps,
      ),
    );
    const thread = await as(ownerA(), (tx) => getThread(tx, ownerA(), id));
    const att = thread.messages[0]?.attachment;
    expect(att).toMatchObject({
      kind: "response",
      response: { id: responseId, comment: "Cold food", rating: 2, locationName: "Bellaire" },
    });
  });

  test("an empty note is refused", async () => {
    await expect(
      as(ownerA(), (tx) =>
        createSurveyRequest(tx, ownerA(), "O", { locationId: locA, note: "  " }, deps),
      ),
    ).rejects.toThrow();
  });
});

describe("who can read and write", () => {
  test("staff read but cannot write or close; client staff see nothing", async () => {
    const id = await open();
    expect((await as(staff(), (tx) => getThread(tx, staff(), id))).messages.length).toBe(1);
    await expect(
      as(staff(), (tx) => postMessage(tx, staff(), "Sam", id, { body: "hi" }, deps)),
    ).rejects.toBeInstanceOf(SurveyForbiddenError);
    await expect(
      as(staff(), (tx) => closeRequest(tx, staff(), "Sam", id, "fulfilled", null, deps)),
    ).rejects.toBeInstanceOf(SurveyForbiddenError);
    await expect(
      as(clientStaff(), (tx) => getThread(tx, clientStaff(), id)),
    ).rejects.toBeInstanceOf(SurveyForbiddenError);
  });

  test("another client cannot see, write to or close the thread", async () => {
    const id = await open();
    await expect(as(ownerB(), (tx) => getThread(tx, ownerB(), id))).rejects.toBeInstanceOf(
      SurveyNotFoundError,
    );
    await expect(
      as(ownerB(), (tx) => postMessage(tx, ownerB(), "Bea", id, { body: "hi" }, deps)),
    ).rejects.toBeInstanceOf(SurveyNotFoundError);
    await expect(
      as(ownerB(), (tx) => closeRequest(tx, ownerB(), "Bea", id, "fulfilled", null, deps)),
    ).rejects.toBeInstanceOf(SurveyNotFoundError);
    expect(
      (await as(ownerB(), (tx) => listSurveyRequests(tx, ownerB()))).some((r) => r.id === id),
    ).toBe(false);
  });

  test("the side comes from the role", async () => {
    const id = await open();
    const fromAm = await as(am(), (tx) =>
      postMessage(tx, am(), "Alex", id, { body: "On it" }, deps),
    );
    const fromOwner = await as(ownerA(), (tx) =>
      postMessage(tx, ownerA(), "Olivia", id, { body: "Thanks" }, deps),
    );
    expect([fromAm.side, fromOwner.side]).toEqual(["agency", "client"]);
  });
});

describe("the conversation", () => {
  test("each message notifies the other side only, with a truncated body", async () => {
    const id = await open();
    const long = `${"y".repeat(400)}`;
    await as(am(), (tx) => postMessage(tx, am(), "Alex", id, { body: long }, deps));
    const toOwner = (await notesTo(ids.ownerA)).at(-1);
    expect(toOwner?.body.length).toBeLessThanOrEqual(220);
    expect(toOwner?.body).not.toContain("y".repeat(200));
    expect((await notesTo(ids.am)).filter((n) => n.body.includes("y".repeat(20))).length).toBe(0);
    const thread = await as(ownerA(), (tx) => getThread(tx, ownerA(), id));
    expect(thread.request.awaiting).toBe("client");
  });

  test("the owner closes as solved but cannot decline; the agency can decline", async () => {
    const id = await open();
    await expect(
      as(ownerA(), (tx) => closeRequest(tx, ownerA(), "Olivia", id, "dismissed", null, deps)),
    ).rejects.toBeInstanceOf(SurveyForbiddenError);
    await as(ownerA(), (tx) =>
      closeRequest(tx, ownerA(), "Olivia", id, "fulfilled", "All good now", deps),
    );
    const closed = await as(am(), (tx) => getThread(tx, am(), id));
    expect(closed.request).toMatchObject({ status: "fulfilled", awaiting: null });
    expect(closed.messages.at(-1)).toMatchObject({ side: "client", body: "All good now" });

    const id2 = await open();
    await as(am(), (tx) =>
      closeRequest(tx, am(), "Alex", id2, "dismissed", "We cannot do that", deps),
    );
    expect((await as(am(), (tx) => getThread(tx, am(), id2))).request.status).toBe("dismissed");
  });

  test("a message in a closed thread reopens it", async () => {
    const id = await open();
    await as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps));
    await as(ownerA(), (tx) =>
      postMessage(tx, ownerA(), "Olivia", id, { body: "Actually it is still wrong" }, deps),
    );
    const t = await as(am(), (tx) => getThread(tx, am(), id));
    expect(t.request).toMatchObject({ status: "open", awaiting: "agency" });
    const [row] = (await admin.unsafe(
      "select handled_at, handled_by from reputation.survey_requests where id = $1",
      [id],
    )) as { handled_at: Date | null; handled_by: string | null }[];
    expect(row).toEqual({ handled_at: null, handled_by: null });
  });

  test("closing twice is refused and does not notify or audit twice", async () => {
    const id = await open();
    await as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps));
    const before = (await notesTo(ids.ownerA)).length;
    await expect(
      as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps)),
    ).rejects.toBeInstanceOf(SurveyStateError);
    expect((await notesTo(ids.ownerA)).length).toBe(before);
    const [audit] = (await admin.unsafe(
      "select count(*)::int as n from core.audit_log where action = 'reputation.help_closed_fulfilled' and (input #>> '{}')::jsonb ->> 'requestId' = $1",
      [id],
    )) as { n: number }[];
    expect(audit?.n).toBe(1);
  });

  test("a whitespace-only closing message counts as no message", async () => {
    const id = await open();
    await as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", "   ", deps));
    const t = await as(am(), (tx) => getThread(tx, am(), id));
    expect(t.messages.length).toBe(1);
    expect(t.request.status).toBe("fulfilled");
  });

  test("two agency users closing at once: exactly one wins", async () => {
    const id = await open();
    const results = await Promise.allSettled([
      as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps)),
      as(agencyAdmin(), (tx) =>
        closeRequest(tx, agencyAdmin(), "Ada", id, "dismissed", null, deps),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
  });
});

describe("a message racing a close", () => {
  test("a message is never stranded in a closed request", async () => {
    const live = { publish: async (e: AtriumEvent) => void events.push(e) };
    for (let i = 0; i < 5; i += 1) {
      const id = await open(`Race ${i}`);
      const results = await Promise.allSettled([
        as(ownerA(), (tx) =>
          postMessage(tx, ownerA(), "Olivia", id, { body: `Late word ${i}` }, live),
        ),
        as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, live)),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      const audits = (await admin.unsafe(
        "select seq::int as seq, action from core.audit_log where (input #>> '{}')::jsonb ->> 'requestId' = $1 and action in ('reputation.help_message_posted', 'reputation.help_closed_fulfilled')",
        [id],
      )) as { seq: number; action: string }[];
      const posted = audits.find((r) => r.action === "reputation.help_message_posted")?.seq ?? 0;
      const closed = audits.find((r) => r.action === "reputation.help_closed_fulfilled")?.seq ?? 0;
      const { request } = await as(am(), (tx) => getThread(tx, am(), id));
      if (closed < posted) {
        // the message came after the close: it must have reopened the request for the agency
        expect(request).toMatchObject({ status: "open", awaiting: "agency" });
      } else {
        // the close came after the message: closed, nothing awaited
        expect(request).toMatchObject({ status: "fulfilled", awaiting: null });
      }
      expect(request.lastPreview).toBe(`Late word ${i}`);
    }
  });
});

describe("attachments", () => {
  test("an external review is stored and returned as a card", async () => {
    const id = await open();
    const m = await as(ownerA(), (tx) =>
      postMessage(
        tx,
        ownerA(),
        "Olivia",
        id,
        {
          body: "This review is unfair",
          attachment: {
            kind: "review",
            url: "https://maps.google.com/?cid=1",
            rating: 1,
            text: "<b>Awful</b> place",
          },
        },
        deps,
      ),
    );
    expect(m.attachment).toEqual({
      kind: "review",
      url: "https://maps.google.com/?cid=1",
      rating: 1,
      text: "<b>Awful</b> place",
    });
  });

  test("a response of another client, of a hidden location, or unknown is refused and nothing is stored", async () => {
    const id = await open();
    const other = await respond(b, locB, { comment: "Not yours" });
    const mine = await respond(a, locA2, { comment: "Heights only" });
    const before = (await as(am(), (tx) => getThread(tx, am(), id))).messages.length;
    for (const responseId of [other, crypto.randomUUID()]) {
      await expect(
        as(ownerA(), (tx) =>
          postMessage(
            tx,
            ownerA(),
            "Olivia",
            id,
            { body: "see", attachment: { kind: "response", responseId } },
            deps,
          ),
        ),
      ).rejects.toBeInstanceOf(HelpAttachmentError);
    }
    // a location-scoped owner scope that cannot see Heights
    const scoped: Scope = {
      kind: "client",
      userId: ids.ownerA,
      role: "client_owner",
      clientId: a,
      locationIds: [locA],
    };
    await expect(
      as(scoped, (tx) =>
        postMessage(
          tx,
          scoped,
          "Olivia",
          id,
          { body: "see", attachment: { kind: "response", responseId: mine } },
          deps,
        ),
      ),
    ).rejects.toBeInstanceOf(HelpAttachmentError);
    expect((await as(am(), (tx) => getThread(tx, am(), id))).messages.length).toBe(before);
  });

  test("a response card never carries contact details or the guest id", async () => {
    const responseId = await respond(a, locA, {
      comment: "Call me",
      wantsContact: true,
      contactEmail: `secret-${suffix}@guest.test`,
      contactName: "Secret Name",
    });
    const id = await open();
    const m = await as(ownerA(), (tx) =>
      postMessage(
        tx,
        ownerA(),
        "Olivia",
        id,
        { body: "this one", attachment: { kind: "response", responseId } },
        deps,
      ),
    );
    const json = JSON.stringify(m);
    expect(json).not.toContain("secret-");
    expect(json).not.toContain("Secret Name");
    expect(json).not.toContain("guest");
  });
});

describe("lists", () => {
  test("the request list carries the thread summary", async () => {
    const id = await open("Summary please");
    const row = (await as(am(), (tx) => listSurveyRequests(tx, am()))).find((r) => r.id === id);
    expect(row).toMatchObject({
      lastAuthorSide: "client",
      lastPreview: "Summary please",
      awaiting: "agency",
      status: "open",
    });
  });

  test("pickable responses are the recent ones of visible locations, with a short excerpt", async () => {
    await respond(a, locA, { comment: "z".repeat(200) });
    const pick = await as(ownerA(), (tx) => listPickableResponses(tx, ownerA()));
    expect(pick.length).toBeGreaterThan(0);
    expect(pick.length).toBeLessThanOrEqual(20);
    expect(pick.every((p) => p.excerpt.length <= 60)).toBe(true);
    const scoped: Scope = {
      kind: "client",
      userId: ids.ownerA,
      role: "client_owner",
      clientId: a,
      locationIds: [locA],
    };
    const some = await as(scoped, (tx) => listPickableResponses(tx, scoped));
    expect(some.every((p) => p.locationName === "Bellaire")).toBe(true);
    await expect(
      as(clientStaff(), (tx) => listPickableResponses(tx, clientStaff())),
    ).resolves.toBeDefined();
  });
});
