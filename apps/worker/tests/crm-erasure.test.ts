import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createClientWithOrganization,
  createDatabase,
  createEventBus,
  createLocation,
  type EventBus,
  eraseGuest,
  type Scope,
  withAgency,
  withScope,
  withTenant,
} from "@atrium/core";
import {
  attachEmail,
  type CrmDeps,
  getCardByToken,
  issueCard,
  joinToken,
  redeemReward,
  stampCard,
  upsertProgram,
} from "@atrium/crm";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { type Logger, startWorker } from "../src/worker";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const SCHEMA = `queue_crm_${suffix}`;
const SECRET = "loyalty-secret-for-tests";
const CONFIG = {
  agents: {
    call: async () => ({ decision: "executed" }),
  } as unknown as import("@atrium/contracts").AgentsClient,
};
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const log: Logger = { info: () => {}, error: () => {} };

let bus: EventBus;
let worker: { stop: () => Promise<void> };
let clientId = "";

async function waitFor(check: () => boolean | Promise<boolean>, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(200);
  }
  throw new Error("timed out waiting for condition");
}

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await admin.unsafe(`create schema "${SCHEMA}" authorization atrium_app`);
  await withAgency(db, async (tx) => {
    clientId = (
      await createClientWithOrganization(tx, { name: "CrmErase", slug: `wk-crm-${suffix}` })
    ).client.id;
  });
  bus = createEventBus(db, {
    url: APP_URL,
    schema: SCHEMA,
    retry: { limit: 1, delaySeconds: 1, maxDelaySeconds: 1 },
  });
  worker = await startWorker({ db, bus, config: CONFIG, log });
});

afterAll(async () => {
  await worker.stop();
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`wk-crm-${suffix}`}`),
  );
  await admin.unsafe(`drop schema "${SCHEMA}" cascade`);
  await admin.close();
  await close();
});

describe("crm erasure through the worker", () => {
  test("guest.erased detaches the card; the card keeps its stamps and reward", async () => {
    const agency: Scope = { kind: "agency", userId: `ce-admin-${suffix}`, role: "agency_admin" };
    const owner: Scope = {
      kind: "client",
      userId: `ce-o-${suffix}`,
      role: "client_owner",
      clientId,
    };
    const deps: CrmDeps = {
      secret: SECRET,
      publish: (event, tx) => bus.publish(event, tx),
    };
    const locationId = await withAgency(db, async (tx) => {
      const id = (await createLocation(tx, clientId, { name: "CE", timeZone: "UTC" })).id;
      await tx.execute(sql`update core.locations set status = 'active' where id = ${id}`);
      return id;
    });
    const program = await withScope(db, agency, (tx) =>
      upsertProgram(
        tx,
        agency,
        locationId,
        {
          name: "Card",
          stampsRequired: 2,
          rewardLabel: "Free",
          cooldownMinutes: 0,
          active: true,
          accent: "lime",
        },
        deps,
      ),
    );
    const issued = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: `ce-${suffix}`, ip: "10.9.8.7" },
      deps,
    );
    if (!issued.ok) throw new Error("issue failed");
    const email = `erase-${suffix}@guests.example.com`;
    expect(
      await attachEmail(db, { cardToken: issued.card.token, email, consent: true }, deps),
    ).toEqual({ ok: true });
    for (const k of ["a", "b"]) {
      await withScope(db, owner, (tx) =>
        stampCard(
          tx,
          owner,
          { locationId, code: issued.card.shortCode },
          { idempotencyKey: `${k}-${suffix}` },
          deps,
        ),
      );
    }
    const [card] = await admin.unsafe(
      "select id, guest_id from crm.loyalty_cards where location_id = $1",
      [locationId],
    );
    expect(card.guest_id).toBeTruthy();

    await withTenant(db, clientId, (tx) =>
      eraseGuest(tx, card.guest_id, { publish: (event, t) => bus.publish(event, t) }),
    );
    await waitFor(async () => {
      const [row] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
        card.id,
      ]);
      return row.guest_id === null;
    });

    const view = await getCardByToken(db, issued.card.token, deps);
    expect(view).toMatchObject({ stampsInCycle: 0, rewardReady: true, state: "active" });
    const rewards = await admin.unsafe(
      "select redeemed_at from crm.loyalty_rewards where card_id = $1",
      [card.id],
    );
    expect(rewards).toHaveLength(1);
    // still a working card: the earned reward can be redeemed
    await withScope(db, owner, (tx) =>
      redeemReward(
        tx,
        owner,
        { locationId, code: issued.card.shortCode },
        { idempotencyKey: `r-${suffix}` },
        deps,
      ),
    );
  }, 40000);
});
