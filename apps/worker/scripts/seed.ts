/**
 * Demo data for trying Host by hand. Safe to run twice: it reuses what exists and issues a new
 * connector token each run. Run `bun run db:migrate` first.
 *
 *   bun run seed
 */
import {
  assignClient,
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
import { updateLocationSettings } from "@atrium/reputation";
import { createConnectorToken } from "@atrium/signals";
import { SQL } from "bun";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const API = process.env.PUBLIC_BASE_URL ?? "http://localhost:3001";

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=DEMO";
const GUEST_EMAIL = "guest@demo.test";
const actor = { type: "user", id: "seed" } as const;

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);

const [existing] = (await admin.unsafe(
  `select c.id as client_id, l.id as location_id, o.id as org_id
   from core.clients c
   join core.locations l on l.client_id = c.id
   join core.organizations o on o.slug = 'demo-casa-olivo-org'
   where c.slug = 'demo-casa-olivo' limit 1`,
)) as { client_id: string; location_id: string; org_id: string }[];

let clientId = existing?.client_id ?? "";
let locationId = existing?.location_id ?? "";

if (!existing) {
  let agencyOrg = "";
  let clientOrg = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium Demo", slug: "demo-atrium" }))
      .id;
    const created = await createClientWithOrganization(tx, {
      name: "Casa Olivo (demo)",
      slug: "demo-casa-olivo",
    });
    clientId = created.client.id;
    clientOrg = created.organization.id;
    locationId = (
      await createLocation(tx, clientId, {
        name: "Casa Olivo Bellaire",
        timeZone: "America/Chicago",
      })
    ).id;
    await setPackage(tx, clientId, "pillar_2", actor); // includes Reputation, so Host runs
    await updateLocationSettings(
      tx,
      clientId,
      locationId,
      { reviewUrl: REVIEW_URL, requestDelayMinutes: 0 },
      actor,
    );
  });
  // The admin connection sees rows only after the transaction above has committed.
  await admin.unsafe("update core.organizations set slug = 'demo-casa-olivo-org' where id = $1", [
    clientOrg,
  ]);
  for (const [id, org, role] of [
    ["demo-owner", clientOrg, "client_owner"],
    ["demo-am", agencyOrg, "account_manager"],
  ] as const) {
    await admin.unsafe(
      "insert into core.users (id, name, email) values ($1, $1, $2) on conflict do nothing",
      [id, `${id}@demo.test`],
    );
    await admin.unsafe(
      "insert into core.members (id, organization_id, user_id, role) values ($1, $2, $3, $4)",
      [crypto.randomUUID(), org, id, role],
    );
  }
  await withAgency(db, (tx) => assignClient(tx, "demo-am", clientId, actor));
}

const guestId = await withTenant(db, clientId, async (tx) => {
  const id = await resolveGuest(tx, clientId, { email: GUEST_EMAIL });
  await recordConsent(tx, id, "email", "marketing", "qr");
  return id;
});

const { token } = await withAgency(db, (tx) =>
  createConnectorToken(
    tx,
    { name: `demo-${Date.now()}`, sources: ["toast"], clientIds: [clientId] },
    actor,
  ),
);

const today = new Date().toISOString().slice(0, 10);
console.log(`
Client:   ${clientId}
Location: ${locationId}
Guest:    ${guestId}  (${GUEST_EMAIL}, consent: email/marketing)
Token:    ${token}

1) Start the API and the worker (two terminals):
     bun run --filter @atrium/api dev
     bun run --filter @atrium/worker dev

2) Simulate a Toast order from that guest (an identified visit; Ask schedules a request):
     curl -s ${API}/v1/signals -H 'authorization: Bearer ${token}' -H 'content-type: application/json' \\
       -d '{"rows":[{"date":"${today}","locationId":"${locationId}","source":"toast","signalType":"order","value":1,"guestId":"${guestId}"}]}'

3) Within a minute Ask sends the review request. Read the survey link from the outbox:
     docker exec atrium-postgres-1 psql -U atrium atrium -c \\
       "select body from core.notifications where kind = 'reputation.review_request' order by created_at desc limit 1"

4) Open the /s/svy_... link in a browser and submit a rating of 1 to 3.
   Recovery opens a private case and alerts the owner and the account manager:
     docker exec atrium-postgres-1 psql -U atrium atrium -c \\
       "select severity, status, due_at from reputation.recovery_cases order by opened_at desc limit 1"
     docker exec atrium-postgres-1 psql -U atrium atrium -c \\
       "select actor_id, action, decision, reason from core.audit_log order by seq desc limit 10"
`);

await admin.close();
await close();
