import {
  ACCESS_LEVELS,
  type AccessLevel,
  FEATURES,
  type Feature,
  PACKAGES,
  type PackageId,
} from "@atrium/contracts";
import { and, eq, isNull } from "drizzle-orm";
import { canSendSms, isLive, type Overrides, resolveAccess, resolveLevel } from "../domain/access";
import type { Tx } from "../infra/db";
import { clientPackages, featureOverrides } from "../infra/schema";
import type { GuestDeps } from "./guests";

const isPackage = (value: string): value is PackageId =>
  (PACKAGES as readonly string[]).includes(value);
const isLevel = (value: string): value is AccessLevel =>
  (ACCESS_LEVELS as readonly string[]).includes(value);
const isFeature = (value: string): value is Feature =>
  (FEATURES as readonly string[]).includes(value);

/** Changing a package, an override or a registration needs agency scope; RLS enforces it. */
export type AccessDeps = GuestDeps;

export async function getPackage(tx: Tx, clientId: string) {
  const [row] = await tx.select().from(clientPackages).where(eq(clientPackages.clientId, clientId));
  if (!row || !isPackage(row.package)) return null;
  return { package: row.package, smsRegistered: row.smsRegistered };
}

/** Sets the client's package and publishes `package.changed` when it actually changes. */
export async function setPackage(
  tx: Tx,
  clientId: string,
  pkg: PackageId,
  deps: AccessDeps = {},
): Promise<boolean> {
  if (!isPackage(pkg)) throw new Error(`unknown package: ${pkg}`);
  const previous = await getPackage(tx, clientId);
  if (previous?.package === pkg) return false;

  await tx
    .insert(clientPackages)
    .values({ clientId, package: pkg })
    .onConflictDoUpdate({
      target: clientPackages.clientId,
      set: { package: pkg, updatedAt: new Date() },
    });
  await deps.publish?.(
    {
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      clientId,
      locationId: null,
      type: "package.changed",
      version: 1,
      data: { previous: previous?.package ?? null, current: pkg },
    },
    tx,
  );
  return true;
}

/** Records that the carrier approved the client's SMS registration (or revoked it). */
export async function setSmsRegistered(tx: Tx, clientId: string, registered: boolean) {
  const updated = await tx
    .update(clientPackages)
    .set({ smsRegistered: registered, updatedAt: new Date() })
    .where(eq(clientPackages.clientId, clientId))
    .returning({ clientId: clientPackages.clientId });
  if (updated.length === 0) throw new Error("the client has no package yet");
}

/** An override for a whole client (no locationId) or for one of its locations. */
export async function setOverride(
  tx: Tx,
  clientId: string,
  feature: Feature,
  level: AccessLevel,
  options: { locationId?: string; note?: string } = {},
) {
  if (!isFeature(feature)) throw new Error(`unknown feature: ${feature}`);
  if (!isLevel(level)) throw new Error(`unknown level: ${level}`);
  const locationId = options.locationId ?? null;
  await tx
    .insert(featureOverrides)
    .values({ clientId, locationId, feature, level, note: options.note ?? null })
    .onConflictDoUpdate({
      target: [featureOverrides.clientId, featureOverrides.locationId, featureOverrides.feature],
      set: { level, note: options.note ?? null },
    });
}

export async function clearOverride(
  tx: Tx,
  clientId: string,
  feature: Feature,
  locationId?: string,
) {
  await tx
    .delete(featureOverrides)
    .where(
      and(
        eq(featureOverrides.clientId, clientId),
        eq(featureOverrides.feature, feature),
        locationId
          ? eq(featureOverrides.locationId, locationId)
          : isNull(featureOverrides.locationId),
      ),
    );
}

async function loadOverrides(
  tx: Tx,
  clientId: string,
  locationId: string | null,
): Promise<Overrides> {
  const rows = await tx
    .select()
    .from(featureOverrides)
    .where(eq(featureOverrides.clientId, clientId));
  const overrides: Required<Overrides> = { client: {}, location: {} };
  for (const row of rows) {
    if (!isFeature(row.feature) || !isLevel(row.level)) continue;
    if (row.locationId === null) overrides.client[row.feature] = row.level;
    else if (row.locationId === locationId) overrides.location[row.feature] = row.level;
  }
  return overrides;
}

/** Every feature's level for a client, optionally narrowed to one of its locations. */
export async function accessFor(tx: Tx, clientId: string, locationId: string | null = null) {
  const current = await getPackage(tx, clientId);
  return resolveAccess(current?.package ?? null, await loadOverrides(tx, clientId, locationId));
}

export async function accessLevel(
  tx: Tx,
  clientId: string,
  locationId: string | null,
  feature: Feature,
): Promise<AccessLevel> {
  const current = await getPackage(tx, clientId);
  return resolveLevel(
    current?.package ?? null,
    feature,
    await loadOverrides(tx, clientId, locationId),
  );
}

/** Docs: `isEnabled(clientId, locationId, module)`. A locked feature is off for everyone. */
export async function isEnabled(
  tx: Tx,
  clientId: string,
  locationId: string | null,
  feature: Feature,
): Promise<boolean> {
  return isLive(await accessLevel(tx, clientId, locationId, feature));
}

/** SMS needs Retention and an approved registration. Email only needs consent. */
export async function smsAllowed(tx: Tx, clientId: string): Promise<boolean> {
  const current = await getPackage(tx, clientId);
  if (!current) return false;
  const retention = await accessLevel(tx, clientId, null, "retention");
  return canSendSms(retention, current.smsRegistered);
}

/**
 * Plugs a feature into the event bus: a consumer of a locked feature ignores the client's events.
 * `bus.subscribe(name, type, handler, { isEnabled: featureGate("retention") })`.
 */
export function featureGate(feature: Feature) {
  return (tx: Tx, clientId: string) => isEnabled(tx, clientId, null, feature);
}
