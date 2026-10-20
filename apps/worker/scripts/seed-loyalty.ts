/**
 * DEV ONLY. Gives every demo location that has no loyalty program an active one, and prints each
 * location's program and its join URL (the address the printed QR would carry). Safe to run twice:
 * a location that already has a program is left as it is. The demo clients are moved to Pillar 3, the
 * package that unlocks Retention, when they are below it. Prints no password.
 * Run `bun run db:migrate` and `bun run seed` (or `seed:history`) first, and set LOYALTY_SECRET.
 *
 *   bun run seed:loyalty
 */
import {
  accessFor,
  createDatabase,
  type Scope,
  setPackage,
  withAgency,
  withScope,
} from "@atrium/core";
import {
  ACCENTS,
  type Accent,
  getProgram,
  joinToken,
  type ProgramInput,
  upsertProgram,
} from "@atrium/crm";
import { SQL } from "bun";
import { isLocalDatabase } from "./seed-history";

export type DemoLocation = { id: string; clientId: string; name: string };

/** The programs to create: one per location that has none, with a small stable variety. */
export function planLoyalty(
  locations: readonly DemoLocation[],
  withProgram: ReadonlySet<string>,
): { location: DemoLocation; input: ProgramInput }[] {
  return locations
    .filter((l) => !withProgram.has(l.id))
    .map((location, i) => ({
      location,
      input: {
        name: `${location.name} Card`,
        stampsRequired: 8,
        rewardLabel: "A free coffee or dessert",
        cooldownMinutes: 240,
        active: true,
        accent: ACCENTS[i % ACCENTS.length] as Accent,
      },
    }));
}

async function main() {
  const ADMIN_URL =
    process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
  const APP_URL =
    process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
  for (const url of [ADMIN_URL, APP_URL]) {
    if (!isLocalDatabase(url)) {
      console.error(
        "seed-loyalty only runs against a local database (localhost, 127.0.0.1 or ::1).",
      );
      process.exit(1);
    }
  }
  const secret = process.env.LOYALTY_SECRET;
  if (!secret) {
    console.error(
      "Set LOYALTY_SECRET (32+ characters, see .env.example): the join token needs it.",
    );
    process.exit(1);
  }
  const origin = (process.env.QR_CARD_URL || "http://localhost:3006").replace(/\/$/, "");

  const { db, close } = createDatabase(APP_URL);
  const admin = new SQL(ADMIN_URL);
  try {
    const locations = (await admin.unsafe(
      `select l.id, l.client_id as "clientId", l.name from core.locations l
         join core.clients c on c.id = l.client_id
        where c.slug like 'demo-%' order by c.slug, l.name`,
    )) as DemoLocation[];
    if (locations.length === 0) {
      console.error("No demo location found. Run `bun run seed` first.");
      process.exit(1);
    }
    const have = (await admin.unsafe("select location_id from crm.loyalty_programs")) as {
      location_id: string;
    }[];
    const plan = planLoyalty(locations, new Set(have.map((r) => r.location_id)));
    const ownerScope = (clientId: string): Scope => ({
      kind: "client",
      userId: "seed-loyalty",
      role: "client_owner",
      clientId,
    });

    // The card is the `retention` feature, locked below Pillar 3: raise the demo clients that
    // lack it, or every staff route would answer feature_locked.
    const raised: string[] = [];
    for (const clientId of new Set(locations.map((l) => l.clientId))) {
      const scope = ownerScope(clientId);
      const access = await withScope(db, scope, (tx) => accessFor(tx, clientId));
      if (access.retention !== "locked") continue;
      await withAgency(db, (tx) =>
        setPackage(tx, clientId, "pillar_3", { type: "user", id: "seed-loyalty" }),
      );
      raised.push(clientId);
    }
    if (raised.length > 0)
      console.log(`Moved ${raised.length} demo client(s) to Pillar 3 for Retention.`);

    for (const { location, input } of plan) {
      const scope = ownerScope(location.clientId);
      await withScope(db, scope, (tx) => upsertProgram(tx, scope, location.id, input, { secret }));
    }

    for (const location of locations) {
      const scope = ownerScope(location.clientId);
      const program = await withScope(db, scope, (tx) => getProgram(tx, scope, location.id));
      if (!program) continue;
      const made = plan.some((p) => p.location.id === location.id);
      console.log(
        `${location.name}: ${made ? "created" : "already there"}, ${program.stampsRequired} stamps for "${program.rewardLabel}", cooldown ${program.cooldownMinutes} min, ${program.active ? "active" : "paused"}\n  join: ${origin}/j/${joinToken(program, secret)}`,
      );
    }
    console.log(
      plan.length === 0 ? "\nNothing new was added." : `\nCreated ${plan.length} program(s).`,
    );
  } finally {
    await admin.close();
    await close();
  }
}

if (import.meta.main) await main();
