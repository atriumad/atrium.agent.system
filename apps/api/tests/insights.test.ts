import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SurveySubmission } from "@atrium/contracts";
import {
  assignClient,
  assignLocation,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
} from "@atrium/core";
import {
  generateInvitationToken,
  hashInvitationToken,
  openCase,
  submitSurvey,
} from "@atrium/reputation";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-ins-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const NOW = new Date("2026-10-06T17:00:00Z");

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
});
const app = createApp({ db, now: () => NOW, session: { auth, agencySlug: AGENCY_SLUG } });

const email = (label: string) => `${label}-${suffix}@ins.test`;
const cookies: Record<string, string> = {};
let clientA = "";
let clientB = "";
let locA1 = "";
let locA2 = "";
let locB = "";
let pendingA = "";
let caseA = "";

async function userWith(label: string, orgId: string, role: string, teamRole?: string) {
  const { user } = await auth.api.signUpEmail({
    body: { email: email(label), password: PASSWORD, name: label },
  });
  await auth.api.addMember({
    body: {
      userId: user.id,
      organizationId: orgId,
      role,
      ...(teamRole ? { teamRole } : {}),
    } as never,
  });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: email(label), password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  cookies[label] = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return user.id;
}

const get = (label: string | null, path: string) =>
  app.request(path, { headers: label ? { cookie: cookies[label] as string } : {} });

async function caseFor(client: string, location: string, comment: string) {
  const token = generateInvitationToken();
  await admin.unsafe(
    `insert into reputation.survey_invitations (client_id, location_id, token_hash, channel, expires_at)
     values ($1, $2, $3, 'email', $4)`,
    [client, location, hashInvitationToken(token), new Date(NOW.getTime() + 86_400_000)],
  );
  const { responseId } = await submitSurvey(
    db,
    { kind: "invitation", token },
    SurveySubmission.parse({ rating: 1, comment }),
    { now: () => NOW },
  );
  const opened = await withAgency(db, (tx) =>
    openCase(tx, { responseId, severity: "high", reason: "test" }, {}, { now: () => NOW }),
  );
  return opened.caseId;
}

type Queue = {
  kind: string;
  id: string;
  client: string;
  place: string | null;
  overdue: boolean;
  href: string;
}[];
type Agency = {
  clients: { clientId: string }[];
  queue: Queue;
  queueCounts: { cases: number; approvals: number; accounts: number; places: number };
};

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let orgA = "";
  let orgB = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `ins-olivo-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `ins-brasa-${suffix}`,
    });
    clientA = a.client.id;
    clientB = b.client.id;
    orgA = a.organization.id;
    orgB = b.organization.id;
    locA1 = (await createLocation(tx, clientA, { name: "Bellaire", timeZone: "America/Chicago" }))
      .id;
    locA2 = (await createLocation(tx, clientA, { name: "Heights", timeZone: "America/Chicago" }))
      .id;
    locB = (
      await createLocation(tx, clientB, { name: "Norte Secreto", timeZone: "America/Chicago" })
    ).id;
  });
  const amId = await userWith("am", agencyOrg, "account_manager", "account_manager");
  const staffId = await userWith("staff", agencyOrg, "agency_staff");
  await userWith("admin", agencyOrg, "agency_admin");
  await userWith("owner-a", orgA, "client_owner");
  const limitedId = await userWith("limited", orgA, "client_staff");
  await userWith("owner-b", orgB, "client_owner");
  await withAgency(db, async (tx) => {
    for (const id of [amId, staffId]) {
      await assignClient(tx, id, clientA, { type: "user", id: `seed-${suffix}` });
    }
    await assignLocation(tx, limitedId, clientA, locA1, { type: "user", id: `seed-${suffix}` });
  });

  caseA = await caseFor(clientA, locA1, "Slow service at Olivo");
  await caseFor(clientB, locB, "Cold food Zebra");
  // The case of client A is overdue; a place and an approval wait for the agency.
  await admin.unsafe("update reputation.recovery_cases set due_at = $1 where id = $2", [
    new Date(NOW.getTime() - 3_600_000),
    caseA,
  ]);
  pendingA = (
    await admin.unsafe(
      `insert into core.locations (client_id, name, time_zone, status)
     values ($1, 'Patio Nuevo', 'America/Chicago', 'pending') returning id`,
      [clientA],
    )
  )[0].id;
  await admin.unsafe(
    `insert into core.approval_requests (client_id, location_id, requested_by_type, requested_by_id, item_type, item_ref, summary)
     values ($1, $2, 'user', $3, 'location.change', $4, 'Change the hours of Bellaire')`,
    [clientA, locA1, `seed-${suffix}`, `ref-${suffix}`],
  );
  await admin.unsafe(
    `insert into core.onboarding_requests (business_name, owner_name, owner_email, first_location_name, first_location_time_zone)
     values ($1, 'Ana', $2, 'Centro', 'America/Chicago')`,
    [`Newco ${suffix}`, `ana-${suffix}@ins.test`],
  );
});

afterAll(async () => {
  await admin.unsafe("delete from core.onboarding_requests where owner_email like $1", [
    `%-${suffix}@ins.test`,
  ]);
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`ins-%-${suffix}`}`);
  });
  await admin.unsafe("delete from core.organizations where slug like $1 or slug like $2", [
    `%-${suffix}`,
    `atrium-ins-${suffix}`,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@ins.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("who can read what", () => {
  test("no session is 401 on both routes", async () => {
    expect((await get(null, "/api/insights/owner")).status).toBe(401);
    expect((await get(null, "/api/insights/agency")).status).toBe(401);
  });

  test("the other kind of role is 403", async () => {
    expect((await get("admin", "/api/insights/owner")).status).toBe(403);
    expect((await get("am", "/api/insights/owner")).status).toBe(403);
    expect((await get("owner-a", "/api/insights/agency")).status).toBe(403);
  });
});

describe("GET /api/insights/owner", () => {
  test("client A never sees a name, answer or place of client B", async () => {
    const res = await get("owner-a", "/api/insights/owner?range=90d");
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    for (const secret of ["Brasa", "Norte", "Zebra", "Cold food", locB, clientB]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("Bellaire");
  });

  test("a place of another client is 200 and empty, never data", async () => {
    const res = await get("owner-a", `/api/insights/owner?place=${locB}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { places: unknown[] };
    expect(body.places).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("Norte");
  });

  test("staff limited to one place sees only that place", async () => {
    const res = await get("limited", "/api/insights/owner");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { places: { locationId: string }[] };
    expect(body.places.map((p) => p.locationId)).toEqual([locA1]);
    expect(JSON.stringify(body)).not.toContain("Heights");
  });

  test("staff asking for a place outside their places gets 200 and nothing", async () => {
    const res = await get("limited", `/api/insights/owner?place=${locA2}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { places: unknown[] };
    expect(body.places).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("Heights");
  });

  test("an unknown range is 422 and a place that is not a uuid is 422", async () => {
    const range = await get("owner-a", "/api/insights/owner?range=1y");
    expect(range.status).toBe(422);
    expect(await range.json()).toEqual({ error: "invalid_range" });
    const id = await get("owner-a", "/api/insights/owner?place=not-a-uuid");
    expect(id.status).toBe(422);
    expect(await id.json()).toEqual({ error: "invalid_id" });
  });
});

describe("GET /api/insights/agency", () => {
  test("an assigned account manager sees client A and not B; the admin sees both", async () => {
    const am = (await (await get("am", "/api/insights/agency")).json()) as Agency;
    expect(am.clients.map((c) => c.clientId)).toContain(clientA);
    expect(am.clients.map((c) => c.clientId)).not.toContain(clientB);
    expect(JSON.stringify(am)).not.toContain("Brasa");
    const admin = (await (await get("admin", "/api/insights/agency")).json()) as Agency;
    expect(admin.clients.map((c) => c.clientId)).toEqual(
      expect.arrayContaining([clientA, clientB]),
    );
  });

  test("validates the query before the database", async () => {
    const range = await get("am", "/api/insights/agency?range=1y");
    expect(range.status).toBe(422);
    expect(await range.json()).toEqual({ error: "invalid_range" });
    const id = await get("am", "/api/insights/agency?client=nope");
    expect(id.status).toBe(422);
    expect(await id.json()).toEqual({ error: "invalid_id" });
  });

  test("a client outside the assignment is 200 and empty", async () => {
    const res = await get("am", `/api/insights/agency?client=${clientB}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Agency;
    expect(body.clients).toEqual([]);
    expect(body.queue.filter((q) => q.client === "Brasa Norte")).toEqual([]);
  });

  test("the queue puts the overdue case first, then the approval and the place", async () => {
    const body = (await (await get("am", "/api/insights/agency")).json()) as Agency;
    const kinds = body.queue.map((q) => q.kind);
    expect(kinds[0]).toBe("case");
    expect(body.queue[0]).toMatchObject({
      id: caseA,
      overdue: true,
      href: `/reputation/cases?case=${caseA}`,
    });
    expect(kinds.indexOf("approval")).toBeGreaterThan(kinds.lastIndexOf("case"));
    const place = body.queue.find((q) => q.kind === "place");
    expect(place).toMatchObject({ id: pendingA, place: "Patio Nuevo", href: "/approvals/places" });
    expect(kinds.indexOf("place")).toBeGreaterThan(kinds.indexOf("approval"));
    expect(body.queueCounts).toMatchObject({ cases: 1, approvals: 1, places: 1 });
  });

  test("the admin also sees the account requests, between approvals and places", async () => {
    const body = (await (await get("admin", "/api/insights/agency")).json()) as Agency;
    const kinds = body.queue.map((q) => q.kind);
    expect(body.queueCounts.accounts).toBeGreaterThanOrEqual(1);
    const account = body.queue.find((q) => q.kind === "account");
    expect(account?.href).toBe("/approvals/accounts");
    expect(kinds.indexOf("account")).toBeGreaterThan(kinds.indexOf("approval"));
    expect(kinds.indexOf("account")).toBeLessThan(kinds.indexOf("place"));
  });

  test("approvals: a client with no places counts, other clients stay hidden, ?client= narrows", async () => {
    let bareId = "";
    await withAgency(db, async (tx) => {
      bareId = (
        await createClientWithOrganization(tx, { name: "Sin Sitios", slug: `ins-bare-${suffix}` })
      ).client.id;
    });
    await admin.unsafe(
      `insert into core.approval_requests (client_id, requested_by_type, requested_by_id, item_type, item_ref, summary)
       values ($1, 'user', $2, 'location.change', $3, 'Bare approval'),
              ($4, 'user', $2, 'location.change', $5, 'Norte approval')`,
      [bareId, `seed-${suffix}`, `bare-${suffix}`, clientB, `norte-${suffix}`],
    );
    const all = (await (await get("admin", "/api/insights/agency")).json()) as Agency;
    expect(all.queue.find((q) => q.client === "Sin Sitios")?.kind).toBe("approval");
    expect(all.queueCounts.approvals).toBeGreaterThanOrEqual(3);
    const am = (await (await get("am", "/api/insights/agency")).json()) as Agency;
    expect(am.queueCounts.approvals).toBe(1);
    expect(JSON.stringify(am)).not.toContain("Norte approval");
    expect(JSON.stringify(am)).not.toContain("Sin Sitios");
    const one = (await (
      await get("admin", `/api/insights/agency?client=${bareId}`)
    ).json()) as Agency;
    expect(one.queueCounts.approvals).toBe(1);
    expect(one.queue.filter((q) => q.kind === "approval").map((q) => q.client)).toEqual([
      "Sin Sitios",
    ]);
  });

  test("a role without location:manage gets no account items", async () => {
    const res = await get("staff", "/api/insights/agency");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Agency;
    expect(body.queue.some((q) => q.kind === "account")).toBe(false);
    expect(body.queueCounts.accounts).toBe(0);
  });

  test("the queue is capped at 8 while the counts carry the totals", async () => {
    // More than the 50 cases the list holds: the count must come from the uncut total.
    await admin.unsafe(
      `with r as (
         insert into reputation.survey_responses (client_id, location_id, rating, created_at)
         select $1::uuid, $2::uuid, 1, $3::timestamptz from generate_series(1, 60) returning id
       )
       insert into reputation.recovery_cases
         (client_id, location_id, response_id, severity, status, opened_at, due_at)
       select $1::uuid, $2::uuid, id, 'high', 'open', $3::timestamptz, $4::timestamptz from r`,
      [clientA, locA2, new Date(NOW.getTime() - 7_200_000), new Date(NOW.getTime() + 3_600_000)],
    );
    const body = (await (await get("am", "/api/insights/agency")).json()) as Agency;
    expect(body.queue.length).toBe(8);
    expect(body.queueCounts.cases).toBe(61);
    expect(body.queueCounts.approvals).toBe(1);
  });
});
