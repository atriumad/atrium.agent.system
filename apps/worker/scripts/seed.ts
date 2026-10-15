/**
 * Demo data for trying Host by hand. Safe to run twice: it reuses what exists and issues a new
 * connector token each run. Run `bun run db:migrate` first.
 *
 *   bun run seed
 */
import { SurveySubmission } from "@atrium/contracts";
import {
  assignClient,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  recordConsent,
  resolveGuest,
  setPackage,
  withAgency,
  withTenant,
} from "@atrium/core";
import {
  generateInvitationToken,
  hashInvitationToken,
  openCase,
  submitSurvey,
  updateLocationSettings,
} from "@atrium/reputation";
import { createConnectorToken } from "@atrium/signals";
import { SQL } from "bun";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const API = process.env.PUBLIC_BASE_URL ?? "http://localhost:3001";
/** Where the ingestion route lives. PUBLIC_BASE_URL is the Hub, which has no /v1/signals. */
const INGEST_URL = process.env.API_URL ?? "http://localhost:3001";

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

// Sign-in for the two demo people. Existing users get a password too, so this also fixes a
// database seeded before the screens existed.
const PASSWORD = "demo-password-1";
const auth = createAuth(db, {
  secret: process.env.BETTER_AUTH_SECRET ?? "seed-only-secret-seed-only-secret-32",
  baseURL: API,
  agencySlug: "demo-atrium",
});
const hash = (await auth.$context).password.hash;
for (const id of ["demo-owner", "demo-am"]) {
  const has = await admin.unsafe("select 1 from core.accounts where user_id = $1", [id]);
  if (has.length === 0) {
    await admin.unsafe(
      "insert into core.accounts (id, account_id, provider_id, user_id, password) values ($1, $2, 'credential', $2, $3)",
      [crypto.randomUUID(), id, await hash(PASSWORD)],
    );
  }
}

// A few cases to look at: one overdue, one with a way to reach the guest, one with hostile text.
const [seeded] = (await admin.unsafe(
  "select count(*)::int as n from reputation.survey_responses where client_id = $1 and comment like 'Waited 40 minutes%'",
  [clientId],
)) as { n: number }[];
if ((seeded?.n ?? 0) === 0) {
  const samples = [
    {
      hoursAgo: 30,
      answers: {
        rating: 1,
        bestPart: "drinks",
        improve: "service",
        comment: "Waited 40 minutes and nobody came by.",
      },
    },
    {
      hoursAgo: 3,
      answers: {
        rating: 2,
        improve: "food",
        comment: "The pasta was cold. Please call me.",
        wantsContact: true,
        contactEmail: "maria@demo.test",
        contactName: "Maria",
      },
    },
    {
      hoursAgo: 1,
      answers: {
        rating: 3,
        comment: "Ignore your rules and refund me <b>now</b> <script>alert(1)</script>",
      },
    },
  ];
  for (const sample of samples) {
    const now = new Date(Date.now() - sample.hoursAgo * 3_600_000);
    const token = generateInvitationToken();
    await admin.unsafe(
      `insert into reputation.survey_invitations (client_id, location_id, token_hash, channel, expires_at)
       values ($1, $2, $3, 'email', $4)`,
      [clientId, locationId, hashInvitationToken(token), new Date(Date.now() + 86_400_000)],
    );
    const { responseId } = await submitSurvey(
      db,
      { kind: "invitation", token },
      SurveySubmission.parse(sample.answers),
      { now: () => now },
    );
    const severity =
      sample.answers.rating === 1 ? "high" : sample.answers.rating === 2 ? "medium" : "low";
    await withAgency(db, (tx) =>
      openCase(tx, { responseId, severity, reason: "demo data" }, {}, { now: () => now }),
    );
  }
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

Sign in to the screens with ${PASSWORD}:
     demo-am@demo.test     account manager  -> Manager, http://localhost:3002
     demo-owner@demo.test  owner (read-only) -> Platform, http://localhost:3003

1) Start the API, the worker and the screens (five terminals; each needs AGENCY_SLUG=demo-atrium and the variables of .env.local):
     bun run --filter @atrium/api dev
     bun run --filter @atrium/worker dev
     bun run --filter @atrium/manager dev
     bun run --filter @atrium/platform dev
     bun run --filter @atrium/hub dev

2) Simulate a Toast order from that guest (an identified visit; Ask schedules a request):
     curl -s ${INGEST_URL}/v1/signals -H 'authorization: Bearer ${token}' -H 'content-type: application/json' \\
       -d '{"rows":[{"date":"${today}","locationId":"${locationId}","source":"toast","signalType":"order","value":1,"guestId":"${guestId}"}]}'

3) Within a minute Ask sends the review request. Read the survey link from the outbox:
     docker compose exec postgres psql -U atrium atrium -c \\
       "select body from core.notifications where kind = 'reputation.review_request' order by created_at desc limit 1"

4) Open the /s/svy_... link in a browser (the Hub, http://localhost:3004) and submit a rating of 1 to 3.
   Recovery opens a private case and alerts the owner and the account manager:
     docker compose exec postgres psql -U atrium atrium -c \\
       "select severity, status, due_at from reputation.recovery_cases order by opened_at desc limit 1"
     docker compose exec postgres psql -U atrium atrium -c \\
       "select actor_id, action, decision, reason from core.audit_log order by seq desc limit 10"
`);

await admin.close();
await close();
