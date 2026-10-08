import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  recordConsent,
  resolveGuest,
  setPackage,
  withAgency,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { scheduleReviewRequest, sendReviewRequest, updateLocationSettings } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `gate-${suffix}` } as const;
const NOW = new Date("2026-10-06T17:00:00Z");
const deps = { now: () => NOW };

let clientId = "";
let guestId = "";
let pendingLoc = "";
let activeLoc = "";

const setStatus = (id: string, status: string) =>
  withAgency(db, (tx) =>
    tx.execute(sql`update core.locations set status = ${status} where id = ${id}`),
  );

const inClient = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, clientId, fn);

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-lg-${suffix}` });
    clientId = (await createClientWithOrganization(tx, { name: "Gate", slug: `lg-${suffix}` }))
      .client.id;
    await setPackage(tx, clientId, "pillar_3", actor);
    pendingLoc = (await createLocation(tx, clientId, { name: "P", timeZone: "America/Chicago" }))
      .id;
    activeLoc = (await createLocation(tx, clientId, { name: "A", timeZone: "America/Chicago" })).id;
    for (const id of [pendingLoc, activeLoc]) {
      await updateLocationSettings(
        tx,
        clientId,
        id,
        { reviewUrl: "https://g.page/r/x/review" },
        actor,
      );
    }
  });
  await setStatus(pendingLoc, "pending");
  guestId = await inClient(async (tx) => {
    const id = await resolveGuest(tx, clientId, { email: `g-${suffix}@guest.test` });
    await recordConsent(tx, id, "email", "marketing", "qr");
    return id;
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug = ${`lg-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("review requests follow the location's status", () => {
  test("a pending location is never scheduled", async () => {
    const out = await inClient((tx) =>
      scheduleReviewRequest(
        tx,
        { clientId, locationId: pendingLoc, guestId, visitDate: "2026-10-06" },
        deps,
      ),
    );
    expect(out).toEqual({ status: "skipped", reason: "location_inactive" });
  });

  test("a location suspended after scheduling sends nothing", async () => {
    const out = await inClient((tx) =>
      scheduleReviewRequest(
        tx,
        { clientId, locationId: activeLoc, guestId, visitDate: "2026-10-06" },
        deps,
      ),
    );
    expect(out.status).toBe("scheduled");
    await setStatus(activeLoc, "suspended");
    const [row] = await inClient((tx) =>
      tx.execute<{ id: string }>(
        sql`select id from reputation.review_requests where location_id = ${activeLoc}`,
      ),
    );
    const sent = await inClient((tx) =>
      sendReviewRequest(tx, row?.id as string, { publicBaseUrl: "https://s.test" }, deps),
    );
    expect(sent).toEqual({ outcome: "skipped", reason: "location_inactive" });
    const notes = await admin.unsafe(
      "select 1 from core.notifications where client_id = $1 and kind = 'reputation.review_request'",
      [clientId],
    );
    expect(notes).toHaveLength(0);
  });
});
