/**
 * DEV ONLY. Adds 90 days of believable history on top of the demo database so the Overview pages
 * have something to show: three demo clients, four places in four time zones, answers, review
 * requests and recovery cases. The existing demo client and the default `seed` are not touched.
 * Safe to run twice: a client that already has answers is skipped, so the second run adds nothing.
 * Run `bun run db:migrate` (and normally `bun run seed`) first.
 *
 *   bun run seed:history
 */
import {
  assignClient,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  resolveGuest,
  setPackage,
  withAgency,
  withTenant,
} from "@atrium/core";
import { hashInvitationToken, updateLocationSettings } from "@atrium/reputation";
import { SQL } from "bun";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const GUEST_POOL = 12;

// ---------------------------------------------------------------------------------------------
// The plan: pure, seeded, no database and no clock.
// ---------------------------------------------------------------------------------------------

export type HistoryCase = {
  severity: "low" | "medium" | "high";
  status: "open" | "contacted" | "resolved";
  dueAt: Date;
  contactedAt: Date | null;
  resolvedAt: Date | null;
};

export type HistoryAnswer = {
  key: string;
  at: Date;
  rating: number;
  sentiment: "positive" | "mixed" | "negative" | null;
  topics: string[] | null;
  comment: string | null;
  readAt: Date | null;
  reviewClickedAt: Date | null;
  case: HistoryCase | null;
};

export type HistoryRequest = {
  key: string;
  status: "scheduled" | "sent" | "skipped";
  visitDate: string;
  sendAt: Date;
  sentAt: Date | null;
  skippedReason: string | null;
  /** The answer that used this request's invitation, when one did. */
  answerKey: string | null;
  guestSlot: number;
};

export type HistoryLocation = {
  key: string;
  name: string;
  timeZone: string;
  answers: HistoryAnswer[];
  requests: HistoryRequest[];
};

export type HistoryClient = {
  slug: string;
  name: string;
  owner: { id: string; email: string };
  locations: HistoryLocation[];
};

export type HistoryPlan = { now: Date; days: number; clients: HistoryClient[] };

/** A small seeded generator: the same seed always draws the same numbers. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Profile = {
  key: string;
  name: string;
  timeZone: string;
  /** Mean rating on a given day back from now (0 = today). */
  mean: (daysAgo: number) => number;
  perDay: (r: () => number) => number;
  /** Total answers instead of a daily rate (the small-sample place). */
  total?: number;
  read: boolean;
};

const PROFILES: { slug: string; name: string; owner: string; places: Profile[] }[] = [
  {
    slug: "demo-brasa-fuego",
    name: "Brasa & Fuego (demo)",
    owner: "brasa-owner",
    places: [
      {
        key: "houston",
        name: "Brasa & Fuego Houston",
        timeZone: "America/Chicago",
        // A slow rise: about 3.1 ninety days ago, about 4.4 today.
        mean: (d) => 3.1 + 1.3 * (1 - d / 89),
        perDay: (r) => 1 + Math.floor(r() * 3),
        read: true,
      },
      {
        key: "tokyo",
        name: "Brasa & Fuego Tokyo",
        timeZone: "Asia/Tokyo",
        // Steady, then a dip in the last 14 days.
        mean: (d) => (d < 14 ? 2.9 : 4.2),
        perDay: (r) => 1 + Math.floor(r() * 2),
        read: true,
      },
    ],
  },
  {
    slug: "demo-kiwi-cafe",
    name: "Kiwi Cafe (demo)",
    owner: "kiwi-owner",
    places: [
      {
        key: "auckland",
        name: "Kiwi Cafe Auckland",
        timeZone: "Pacific/Auckland",
        mean: () => 4,
        perDay: (r) => Math.floor(r() * 3),
        read: true,
      },
    ],
  },
  {
    slug: "demo-quiet-corner",
    name: "Quiet Corner Books (demo)",
    owner: "quiet-owner",
    places: [
      {
        key: "denver",
        name: "Quiet Corner Denver",
        timeZone: "America/Denver",
        mean: () => 4.2,
        perDay: () => 0,
        total: 7,
        read: false,
      },
    ],
  },
];

const COMMENTS: Record<string, string[]> = {
  wait: [
    "Waited a long time for a table.",
    "Forty minutes before anyone took our order.",
    "The line never seemed to move.",
  ],
  food: ["The food was great.", "My dish arrived cold.", "Lovely flavors, a bit salty."],
  service: ["Friendly service.", "Our server forgot the drinks.", "Quick and attentive."],
  cleanliness: ["The tables were sticky.", "Spotless, as always."],
  price: ["A little expensive for the portions.", "Fair prices."],
  atmosphere: ["Cozy place, a bit loud.", "Great music and lights."],
  staff: ["The staff were kind.", "Someone at the counter was rude."],
  other: ["Parking was hard to find."],
};

const clampRating = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
const utcDate = (at: Date) => at.toISOString().slice(0, 10);

export function buildHistory(input: { seed: number; now: Date; days: number }): HistoryPlan {
  const { now, days } = input;
  const nowMs = now.getTime();
  const r = mulberry32(input.seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(r() * items.length)] as T;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const clients: HistoryClient[] = PROFILES.map((client) => ({
    slug: client.slug,
    name: client.name,
    owner: { id: client.owner, email: `${client.owner}@demo.test` },
    locations: client.places.map((place): HistoryLocation => {
      const answers: HistoryAnswer[] = [];
      const requests: HistoryRequest[] = [];
      const slots = new Map<string, number>();
      let n = 0;

      // Days that get answers. Every day has its own UTC date, so the history spans `days` dates.
      const offsets: number[] = [];
      if (place.total !== undefined) {
        const chosen = new Set<number>();
        while (chosen.size < place.total) chosen.add(3 + Math.floor(r() * (days - 3)));
        offsets.push(...[...chosen].sort((x, y) => x - y));
      } else {
        for (let d = 0; d < days; d++) {
          const count = place.perDay(r);
          for (let k = 0; k < count; k++) offsets.push(d);
        }
      }

      const addRequest = (req: Omit<HistoryRequest, "key" | "visitDate" | "guestSlot">) => {
        const visitDate = utcDate(req.sentAt ?? req.sendAt);
        const used = slots.get(visitDate) ?? 0;
        if (used >= GUEST_POOL) return false;
        slots.set(visitDate, used + 1);
        requests.push({
          ...req,
          key: `${place.key}-req-${requests.length}`,
          visitDate,
          guestSlot: used,
        });
        return true;
      };

      const makeAnswer = (at: Date, rating: number, keyed: string): HistoryAnswer => {
        const read = place.read && (nowMs - at.getTime() > 2 * DAY || r() < 0.8);
        let sentiment: HistoryAnswer["sentiment"] = null;
        let topics: string[] | null = null;
        if (read) {
          sentiment = rating >= 4 ? "positive" : rating === 3 ? "mixed" : "negative";
          topics = [];
          // Waiting is only ever a complaint of the middling and unhappy; and it reads negative.
          if (rating <= 3 && r() < 0.4) topics.push("wait");
          const extras = [
            "food",
            "service",
            "cleanliness",
            "price",
            "atmosphere",
            "staff",
            "other",
          ];
          const more = Math.floor(r() * 2.2);
          for (let k = 0; k < more; k++) {
            const t = pick(extras);
            if (!topics.includes(t)) topics.push(t);
          }
          if (topics.includes("wait") && r() < 0.8) sentiment = "negative";
        }
        const lead = topics?.[0];
        const comment =
          r() < 0.25 ? null : pick(COMMENTS[lead ?? pick(Object.keys(COMMENTS))] ?? ["Fine."]);
        return {
          key: keyed,
          at,
          rating,
          sentiment,
          topics,
          comment,
          readAt: read ? new Date(at.getTime() + (1 + Math.floor(r() * 9)) * MINUTE) : null,
          reviewClickedAt:
            r() < 0.4 ? new Date(at.getTime() + (1 + Math.floor(r() * 29)) * MINUTE) : null,
          case: null,
        };
      };

      for (const d of offsets) {
        const dayStart = startOfToday - d * DAY;
        const span = d === 0 ? Math.max(MINUTE, nowMs - dayStart) : DAY;
        const at = new Date(dayStart + Math.floor(r() * (span - 1)));
        const noise = r() + r() + r() - 1.5;
        const rating = clampRating(place.mean(d) + noise * 1.2);
        const answer = makeAnswer(at, rating, `${place.key}-ans-${n++}`);

        // Closed cases: low and middling ratings, older than two days, contacted 1 to 20 hours after opening.
        if (rating <= 3 && nowMs - at.getTime() > 2 * DAY && r() < (rating <= 2 ? 0.9 : 0.35)) {
          const contactedAt = new Date(at.getTime() + Math.round((1 + r() * 19) * 60) * MINUTE);
          const resolved = r() < 0.6;
          answer.case = {
            severity: rating === 1 ? "high" : rating === 2 ? "medium" : "low",
            status: resolved ? "resolved" : "contacted",
            dueAt: new Date(at.getTime() + DAY),
            contactedAt,
            resolvedAt: resolved
              ? new Date(contactedAt.getTime() + Math.round((1 + r() * 40) * 60) * MINUTE)
              : null,
          };
        }
        answers.push(answer);

        // About half of the answers came through a request's invitation.
        if (r() < 0.55) {
          const sentAt = new Date(at.getTime() - Math.round((1 + r() * 5) * 60) * MINUTE);
          addRequest({
            status: "sent",
            sendAt: sentAt,
            sentAt,
            skippedReason: null,
            answerKey: answer.key,
          });
        }
        // Some requests were sent and never answered, and a few were skipped.
        if (r() < 0.5) {
          const sentAt = new Date(at.getTime() - Math.round((1 + r() * 20) * 60) * MINUTE);
          addRequest({
            status: "sent",
            sendAt: sentAt,
            sentAt,
            skippedReason: null,
            answerKey: null,
          });
        }
        if (r() < 0.07) {
          addRequest({
            status: "skipped",
            sendAt: at,
            sentAt: null,
            skippedReason: "no_consent",
            answerKey: null,
          });
        }
      }

      if (place.total === undefined) {
        // Two requests still waiting to go out.
        for (const hours of [3, 9]) {
          addRequest({
            status: "scheduled",
            sendAt: new Date(nowMs + hours * HOUR),
            sentAt: null,
            skippedReason: null,
            answerKey: null,
          });
        }
      }

      // The cases that need a person now (Houston only): one overdue, two due within a day.
      if (place.key === "houston") {
        for (const [i, [hoursAgo, rating]] of (
          [
            [30, 1],
            [10, 2],
            [3, 2],
          ] as const
        ).entries()) {
          const at = new Date(nowMs - hoursAgo * HOUR);
          const answer = makeAnswer(at, rating, `${place.key}-open-${i}`);
          answer.case = {
            severity: rating === 1 ? "high" : "medium",
            status: "open",
            dueAt: new Date(at.getTime() + DAY),
            contactedAt: null,
            resolvedAt: null,
          };
          answers.push(answer);
        }
      }

      answers.sort((a, b) => a.at.getTime() - b.at.getTime());
      return { key: place.key, name: place.name, timeZone: place.timeZone, answers, requests };
    }),
  }));

  return { now, days, clients };
}

// ---------------------------------------------------------------------------------------------
// The script: inserts the plan the way seed.ts does.
// ---------------------------------------------------------------------------------------------

/** Only a database on this machine may be seeded with demo history. */
export function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function main() {
  const ADMIN_URL =
    process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
  const APP_URL =
    process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
  const API = process.env.PUBLIC_BASE_URL ?? "http://localhost:3001";
  const REVIEW_URL = "https://search.google.com/local/writereview?placeid=DEMO-HISTORY";
  for (const url of [ADMIN_URL, APP_URL]) {
    if (!isLocalDatabase(url)) {
      console.error(
        "seed-history only runs against a local database (localhost, 127.0.0.1 or ::1).",
      );
      process.exit(1);
    }
  }
  // The demo password and auth secret of seed.ts: the same sign-in works for every demo login.
  // These literals must stay identical to the ones in apps/worker/scripts/seed.ts.
  const PASSWORD = "demo-password-1";
  const actor = { type: "user", id: "seed-history" } as const;

  const { db, close } = createDatabase(APP_URL);
  const admin = new SQL(ADMIN_URL);
  try {
    const plan = buildHistory({ seed: 20261017, now: new Date(), days: 90 });

    const auth = createAuth(db, {
      secret: process.env.BETTER_AUTH_SECRET ?? "seed-only-secret-seed-only-secret-32",
      baseURL: API,
      agencySlug: "demo-atrium",
    });
    const hash = (await auth.$context).password.hash;
    const ensurePassword = async (userId: string) => {
      const has = await admin.unsafe("select 1 from core.accounts where user_id = $1", [userId]);
      if (has.length === 0) {
        await admin.unsafe(
          "insert into core.accounts (id, account_id, provider_id, user_id, password) values ($1, $2, 'credential', $2, $3)",
          [crypto.randomUUID(), userId, await hash(PASSWORD)],
        );
      }
    };

    const ensureOwner = async (owner: { id: string; email: string }, orgId: string) => {
      await admin.unsafe(
        "insert into core.users (id, name, email) values ($1, $1, $2) on conflict do nothing",
        [owner.id, owner.email],
      );
      const [member] = await admin.unsafe(
        "select 1 from core.members where organization_id = $1 and user_id = $2",
        [orgId, owner.id],
      );
      if (!member) {
        await admin.unsafe(
          "insert into core.members (id, organization_id, user_id, role) values ($1, $2, $3, 'client_owner')",
          [crypto.randomUUID(), orgId, owner.id],
        );
      }
    };

    // The agency and its account manager: reuse the ones seed.ts made, create them if absent.
    let [agency] = (await admin.unsafe(
      "select id from core.organizations where slug = 'demo-atrium'",
    )) as {
      id: string;
    }[];
    if (!agency) {
      await withAgency(db, (tx) =>
        createAgencyOrganization(tx, { name: "Atrium Demo", slug: "demo-atrium" }),
      );
      [agency] = (await admin.unsafe(
        "select id from core.organizations where slug = 'demo-atrium'",
      )) as {
        id: string;
      }[];
    }
    const agencyOrg = agency?.id ?? "";
    const [am] = await admin.unsafe("select 1 from core.users where id = 'demo-am'");
    if (!am) {
      await admin.unsafe(
        "insert into core.users (id, name, email) values ('demo-am', 'demo-am', 'demo-am@demo.test')",
      );
      await admin.unsafe(
        "insert into core.members (id, organization_id, user_id, role) values ($1, $2, 'demo-am', 'account_manager')",
        [crypto.randomUUID(), agencyOrg],
      );
    }
    await ensurePassword("demo-am");

    const summary: string[] = [];
    const logins = ["demo-am@demo.test"];
    let added = 0;

    for (const client of plan.clients) {
      const [found] = (await admin.unsafe("select id from core.clients where slug = $1", [
        client.slug,
      ])) as { id: string }[];
      let clientId = found?.id ?? "";
      const locationIds = new Map<string, string>();

      if (!found) {
        let clientOrg = "";
        await withAgency(db, async (tx) => {
          const created = await createClientWithOrganization(tx, {
            name: client.name,
            slug: client.slug,
          });
          clientId = created.client.id;
          clientOrg = created.organization.id;
          for (const loc of client.locations) {
            const id = (
              await createLocation(tx, clientId, { name: loc.name, timeZone: loc.timeZone })
            ).id;
            locationIds.set(loc.key, id);
            await updateLocationSettings(
              tx,
              clientId,
              id,
              { reviewUrl: REVIEW_URL, requestDelayMinutes: 0 },
              actor,
            );
          }
          await setPackage(tx, clientId, "pillar_2", actor);
        });
        await admin.unsafe("update core.organizations set slug = $2 where id = $1", [
          clientOrg,
          `${client.slug}-org`,
        ]);
        await ensureOwner(client.owner, clientOrg);
        await withAgency(db, (tx) => assignClient(tx, "demo-am", clientId, actor));
      } else {
        for (const loc of client.locations) {
          const [row] = (await admin.unsafe(
            "select id from core.locations where client_id = $1 and name = $2",
            [clientId, loc.name],
          )) as { id: string }[];
          if (row) locationIds.set(loc.key, row.id);
        }
      }
      if (found) {
        const [org] = (await admin.unsafe("select id from core.organizations where slug = $1", [
          `${client.slug}-org`,
        ])) as { id: string }[];
        if (org) await ensureOwner(client.owner, org.id);
      }
      await ensurePassword(client.owner.id);
      logins.push(client.owner.email);

      const [has] = (await admin.unsafe(
        "select count(*)::int as n from reputation.survey_responses where client_id = $1",
        [clientId],
      )) as { n: number }[];
      if ((has?.n ?? 0) > 0) {
        summary.push(`${client.name}: history already there, nothing added`);
        continue;
      }

      // Guests for the review requests, a small pool per client.
      const guestIds = await withTenant(db, clientId, async (tx) => {
        const ids: string[] = [];
        for (let i = 0; i < GUEST_POOL; i++) {
          ids.push(
            await resolveGuest(tx, clientId, { email: `${client.slug}-guest-${i}@demo.test` }),
          );
        }
        return ids;
      });

      let answers = 0;
      let requests = 0;
      let cases = 0;
      await admin.begin(async (tx) => {
        for (const loc of client.locations) {
          const locationId = locationIds.get(loc.key);
          if (!locationId) throw new Error(`Location ${loc.name} is missing`);
          const responseOf = new Map<string, string>();
          const invitationOf = new Map<string, string>();

          // Invitations first: every sent request has one; some were used by an answer.
          const requestRows: { req: HistoryRequest; invitationId: string | null }[] = [];
          for (const req of loc.requests) {
            let invitationId: string | null = null;
            if (req.status === "sent" && req.sentAt) {
              invitationId = crypto.randomUUID();
              await tx.unsafe(
                `insert into reputation.survey_invitations (id, client_id, location_id, guest_id, token_hash, channel, created_at, expires_at)
               values ($1, $2, $3, $4, $5, 'email', $6, $7)`,
                [
                  invitationId,
                  clientId,
                  locationId,
                  guestIds[req.guestSlot] ?? null,
                  hashInvitationToken(`history:${client.slug}:${req.key}`),
                  req.sentAt,
                  new Date(req.sentAt.getTime() + 30 * DAY),
                ],
              );
              if (req.answerKey) invitationOf.set(req.answerKey, invitationId);
            }
            requestRows.push({ req, invitationId });
          }

          for (const a of loc.answers) {
            const id = crypto.randomUUID();
            responseOf.set(a.key, id);
            const read = a.readAt !== null;
            await tx.unsafe(
              `insert into reputation.survey_responses
               (id, client_id, location_id, invitation_id, rating, comment, review_clicked_at,
                sentiment, topics, concern, safety, read_at, read_model, created_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                id,
                clientId,
                locationId,
                invitationOf.get(a.key) ?? null,
                a.rating,
                a.comment,
                a.reviewClickedAt,
                a.sentiment,
                a.topics ? `{${a.topics.join(",")}}` : null,
                read ? (a.sentiment === "negative" ? "medium" : "none") : null,
                read ? false : null,
                a.readAt,
                read ? "demo/history" : null,
                a.at,
              ],
            );
            answers++;
            const invitationId = invitationOf.get(a.key);
            if (invitationId) {
              await tx.unsafe(
                "update reputation.survey_invitations set used_at = $2 where id = $1",
                [invitationId, a.at],
              );
            }
            if (a.case) {
              await tx.unsafe(
                `insert into reputation.recovery_cases
                 (client_id, location_id, response_id, severity, status, opened_at, due_at,
                  contacted_at, resolved_at, resolved_by, note)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'demo history')`,
                [
                  clientId,
                  locationId,
                  id,
                  a.case.severity,
                  a.case.status,
                  a.at,
                  a.case.dueAt,
                  a.case.contactedAt,
                  a.case.resolvedAt,
                  a.case.resolvedAt ? "demo-am" : null,
                ],
              );
              cases++;
            }
          }

          for (const { req, invitationId } of requestRows) {
            await tx.unsafe(
              `insert into reputation.review_requests
               (client_id, location_id, guest_id, visit_date, status, send_at, sent_at, skipped_reason, invitation_id, created_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                clientId,
                locationId,
                guestIds[req.guestSlot],
                req.visitDate,
                req.status,
                req.sendAt,
                req.sentAt,
                req.skippedReason,
                invitationId,
                req.sentAt ?? new Date(Math.min(req.sendAt.getTime(), plan.now.getTime())),
              ],
            );
            requests++;
          }
        }
      });
      added += answers;
      summary.push(
        `${client.name}: added ${answers} answers, ${requests} requests, ${cases} cases`,
      );
    }

    console.log(`${summary.join("\n")}\n\n${added === 0 ? "Nothing new was added." : `Added ${added} answers.`}
Sign in with ${PASSWORD}:\n${logins.map((e) => `  ${e}`).join("\n")}`);
  } finally {
    await admin.close();
    await close();
  }
}

if (import.meta.main) await main();
