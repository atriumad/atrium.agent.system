import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  type Scope,
  withAgency,
  withScope,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { recoveryCases, surveyResponses } from "../infra/schema";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);

let clientId = "";
let locA = "";
let locB = "";
const scopeFor = (locationIds?: string[]): Scope => ({
  kind: "client",
  userId: `u-${suffix}`,
  role: locationIds ? "client_staff" : "client_owner",
  clientId,
  ...(locationIds ? { locationIds } : {}),
});

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-ls-${suffix}` });
    const c = await createClientWithOrganization(tx, { name: "Two Places", slug: `ls-${suffix}` });
    clientId = c.client.id;
    locA = (await createLocation(tx, clientId, { name: "A", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, clientId, { name: "B", timeZone: "America/Chicago" })).id;
    for (const locationId of [locA, locB]) {
      const [r] = await tx
        .insert(surveyResponses)
        .values({
          clientId,
          locationId,
          templateVersion: 1,
          rating: 1,
          wantsContact: false,
          createdAt: new Date(),
        })
        .returning({ id: surveyResponses.id });
      await tx.insert(recoveryCases).values({
        clientId,
        locationId,
        responseId: (r as { id: string }).id,
        severity: "high",
        openedAt: new Date(),
        dueAt: new Date(),
      });
    }
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug = ${`ls-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

const seen = (scope: Scope) =>
  withScope(db, scope, async (tx) => ({
    responses: (await tx.select().from(surveyResponses)).map((r) => r.locationId).sort(),
    cases: (await tx.select().from(recoveryCases)).map((r) => r.locationId).sort(),
  }));

describe("location scope on responses and cases", () => {
  test("a location manager sees only their location", async () => {
    expect(await seen(scopeFor([locA]))).toEqual({ responses: [locA], cases: [locA] });
  });

  test("a location manager with no locations sees nothing", async () => {
    expect(await seen(scopeFor([]))).toEqual({ responses: [], cases: [] });
  });

  test("the owner sees every location", async () => {
    const both = [locA, locB].sort();
    expect(await seen(scopeFor())).toEqual({ responses: both, cases: both });
  });

  test("the agency sees every location", async () => {
    const both = [locA, locB].sort();
    const rows = await withAgency(db, async (tx) =>
      (await tx.select().from(surveyResponses)).filter((r) => r.clientId === clientId),
    );
    expect(rows.map((r) => r.locationId).sort()).toEqual(both);
  });
});
