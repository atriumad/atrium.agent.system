import type { AtriumEvent } from "@atrium/contracts";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  CHANNEL_IDENTIFIER,
  CHANNELS,
  type Channel,
  type ConsentSource,
  type ContactDecision,
  currentConsent,
  decideContact,
  type IdentifierKind,
  normalizeEmail,
  normalizePhone,
  PURPOSES,
  type Purpose,
} from "../domain/contact";
import type { Tx } from "../infra/db";
import { consents, guestIdentifiers, guests } from "../infra/schema";

/** Enqueues an event inside the caller's transaction. `bus.publish` has this shape. */
export type Publish = (event: AtriumEvent, tx: Tx) => Promise<void>;
export type GuestDeps = { publish?: Publish };

export class InvalidContactError extends Error {}

/** The same person arrived under two guests. Merging touches other modules, so it is explicit. */
export class IdentityConflictError extends Error {
  constructor(readonly guestIds: string[]) {
    super(`identifiers belong to different guests: ${guestIds.join(", ")}`);
  }
}

const envelope = (clientId: string) => ({
  id: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  clientId,
  locationId: null,
});

/** Serializes work on one key for the rest of the transaction. */
async function lock(tx: Tx, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export type GuestInput = { email?: string; phone?: string; name?: string };

/**
 * Returns the guest for these identifiers, creating it if none exists. One identity per client:
 * an email or phone already on a guest resolves to that guest, and a new identifier is attached.
 */
export async function resolveGuest(
  tx: Tx,
  clientId: string,
  input: GuestInput,
  deps: GuestDeps = {},
): Promise<string> {
  const identifiers: { kind: IdentifierKind; value: string }[] = [];
  if (input.email !== undefined) {
    const value = normalizeEmail(input.email);
    if (!value) throw new InvalidContactError("invalid email");
    identifiers.push({ kind: "email", value });
  }
  if (input.phone !== undefined) {
    const value = normalizePhone(input.phone);
    if (!value) throw new InvalidContactError("invalid phone");
    identifiers.push({ kind: "phone", value });
  }
  if (identifiers.length === 0) throw new InvalidContactError("an email or a phone is required");
  const name = input.name?.trim() || null;

  const keys = identifiers.map((i) => `guest:${clientId}:${i.kind}:${i.value}`).sort();
  for (const key of keys) await lock(tx, key);

  const found = await tx
    .select({ guestId: guestIdentifiers.guestId, kind: guestIdentifiers.kind })
    .from(guestIdentifiers)
    .where(
      and(
        eq(guestIdentifiers.clientId, clientId),
        or(
          ...identifiers.map((i) =>
            and(eq(guestIdentifiers.kind, i.kind), eq(guestIdentifiers.value, i.value)),
          ),
        ),
      ),
    );
  const guestIds = [...new Set(found.map((row) => row.guestId))];
  if (guestIds.length > 1) throw new IdentityConflictError(guestIds);

  const existing = guestIds[0];
  if (existing) {
    const have = new Set(found.map((row) => row.kind));
    const missing = identifiers.filter((i) => !have.has(i.kind));
    if (missing.length > 0) {
      await tx
        .insert(guestIdentifiers)
        .values(missing.map((i) => ({ clientId, guestId: existing, ...i })));
    }
    if (name) {
      await tx
        .update(guests)
        .set({ name })
        .where(and(eq(guests.id, existing), isNull(guests.name)));
    }
    return existing;
  }

  const [created] = await tx.insert(guests).values({ clientId, name }).returning({ id: guests.id });
  if (!created) throw new Error("guest was not created");
  await tx
    .insert(guestIdentifiers)
    .values(identifiers.map((i) => ({ clientId, guestId: created.id, ...i })));
  await deps.publish?.(
    { ...envelope(clientId), type: "guest.identified", version: 1, data: { guestId: created.id } },
    tx,
  );
  return created.id;
}

async function loadGuest(tx: Tx, guestId: string) {
  const [guest] = await tx.select().from(guests).where(eq(guests.id, guestId));
  return guest ?? null;
}

/**
 * Appends a consent decision. Records nothing when the current decision is already the same,
 * so the log holds changes, not noise. Returns whether it changed.
 */
async function setConsent(
  tx: Tx,
  guestId: string,
  channel: Channel,
  purpose: Purpose,
  granted: boolean,
  source: ConsentSource,
  deps: GuestDeps,
): Promise<boolean> {
  const guest = await loadGuest(tx, guestId);
  if (!guest) throw new Error("unknown guest");
  if (guest.erasedAt) throw new Error("guest was erased");

  await lock(tx, `consent:${guestId}:${channel}:${purpose}`);
  const log = await tx
    .select({ channel: consents.channel, purpose: consents.purpose, granted: consents.granted })
    .from(consents)
    .where(
      and(
        eq(consents.guestId, guestId),
        eq(consents.channel, channel),
        eq(consents.purpose, purpose),
      ),
    )
    .orderBy(asc(consents.seq));
  const state = currentConsent(log as never, channel, purpose);
  if ((state === "granted") === granted && state !== "none") return false;

  await tx
    .insert(consents)
    .values({ clientId: guest.clientId, guestId, channel, purpose, granted, source });
  await deps.publish?.(
    {
      ...envelope(guest.clientId),
      type: "consent.changed",
      version: 1,
      data: { guestId, channel, purpose, granted },
    },
    tx,
  );
  return true;
}

export function recordConsent(
  tx: Tx,
  guestId: string,
  channel: Channel,
  purpose: Purpose,
  source: ConsentSource,
  deps: GuestDeps = {},
) {
  return setConsent(tx, guestId, channel, purpose, true, source, deps);
}

/** A STOP reply or an unsubscribe link ends every purpose on that channel at once. */
export async function recordOptOut(
  tx: Tx,
  guestId: string,
  channel: Channel,
  source: ConsentSource,
  deps: GuestDeps = {},
) {
  let changed = false;
  for (const purpose of PURPOSES) {
    changed = (await setConsent(tx, guestId, channel, purpose, false, source, deps)) || changed;
  }
  return changed;
}

/** The address for a channel, only when consent allows it. The one door to a guest's contact. */
export async function contactFor(
  tx: Tx,
  guestId: string,
  channel: Channel,
  purpose: Purpose,
): Promise<ContactDecision> {
  if (!CHANNELS.includes(channel)) throw new Error(`unknown channel: ${channel}`);
  const guest = await loadGuest(tx, guestId);
  if (!guest)
    return decideContact({ guestExists: false, erased: false, consent: "none", address: null });

  const log = await tx
    .select({ channel: consents.channel, purpose: consents.purpose, granted: consents.granted })
    .from(consents)
    .where(
      and(
        eq(consents.guestId, guestId),
        eq(consents.channel, channel),
        eq(consents.purpose, purpose),
      ),
    )
    .orderBy(asc(consents.seq));
  const [identifier] = await tx
    .select({ value: guestIdentifiers.value })
    .from(guestIdentifiers)
    .where(
      and(
        eq(guestIdentifiers.guestId, guestId),
        inArray(guestIdentifiers.kind, [CHANNEL_IDENTIFIER[channel]]),
      ),
    )
    .orderBy(asc(guestIdentifiers.createdAt))
    .limit(1);

  return decideContact({
    guestExists: true,
    erased: guest.erasedAt !== null,
    consent: currentConsent(log as never, channel, purpose),
    address: identifier?.value ?? null,
  });
}

export async function canContact(tx: Tx, guestId: string, channel: Channel, purpose: Purpose) {
  return (await contactFor(tx, guestId, channel, purpose)).allowed;
}

/**
 * The phone a guest left, for a person to call. It is not a channel: there is no consent record
 * and nothing is ever sent to it. The caller decides whether the guest asked to be contacted.
 */
export async function phoneFor(tx: Tx, guestId: string): Promise<string | null> {
  const guest = await loadGuest(tx, guestId);
  if (!guest || guest.erasedAt) return null;
  const [identifier] = await tx
    .select({ value: guestIdentifiers.value })
    .from(guestIdentifiers)
    .where(and(eq(guestIdentifiers.guestId, guestId), eq(guestIdentifiers.kind, "phone")))
    .orderBy(asc(guestIdentifiers.createdAt))
    .limit(1);
  return identifier?.value ?? null;
}

/**
 * Erasure on request: identifiers and name go, the opaque guest row and the consent log stay
 * (ids only). Idempotent. Publishes `guest.erased` so every module that stores the id scrubs it.
 */
export async function eraseGuest(tx: Tx, guestId: string, deps: GuestDeps = {}): Promise<boolean> {
  const guest = await loadGuest(tx, guestId);
  if (!guest || guest.erasedAt) return false;
  await lock(tx, `erase:${guestId}`);
  await tx.delete(guestIdentifiers).where(eq(guestIdentifiers.guestId, guestId));
  await tx.update(guests).set({ name: null, erasedAt: sql`now()` }).where(eq(guests.id, guestId));
  await deps.publish?.(
    { ...envelope(guest.clientId), type: "guest.erased", version: 1, data: { guestId } },
    tx,
  );
  return true;
}
