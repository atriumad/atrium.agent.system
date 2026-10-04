import { type Actor, type Tx, writeAudit } from "@atrium/core";
import { eq } from "drizzle-orm";
import { locationSettings } from "../infra/schema";

export const DEFAULT_REQUEST_DELAY_MINUTES = 120;

export type LocationSettings = {
  locationId: string;
  reviewUrl: string | null;
  requestDelayMinutes: number;
  qrVersion: number;
};

export async function getLocationSettings(tx: Tx, locationId: string): Promise<LocationSettings> {
  const [row] = await tx
    .select()
    .from(locationSettings)
    .where(eq(locationSettings.locationId, locationId));
  return {
    locationId,
    reviewUrl: row?.reviewUrl ?? null,
    requestDelayMinutes: row?.requestDelayMinutes ?? DEFAULT_REQUEST_DELAY_MINUTES,
    qrVersion: row?.qrVersion ?? 1,
  };
}

/** The Google review link must be https. It is the one place the system learns where to send guests. */
export function assertReviewUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("the review link is not a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("the review link must be https");
}

export async function updateLocationSettings(
  tx: Tx,
  clientId: string,
  locationId: string,
  changes: { reviewUrl?: string | null; requestDelayMinutes?: number },
  actor: Actor,
): Promise<LocationSettings> {
  if (changes.reviewUrl) assertReviewUrl(changes.reviewUrl);
  if (
    changes.requestDelayMinutes !== undefined &&
    (!Number.isInteger(changes.requestDelayMinutes) ||
      changes.requestDelayMinutes < 0 ||
      changes.requestDelayMinutes > 10080)
  ) {
    throw new Error("the request delay is a whole number of minutes from 0 to 10080");
  }
  const current = await getLocationSettings(tx, locationId);
  const next = {
    reviewUrl: changes.reviewUrl === undefined ? current.reviewUrl : changes.reviewUrl,
    requestDelayMinutes: changes.requestDelayMinutes ?? current.requestDelayMinutes,
  };
  await tx
    .insert(locationSettings)
    .values({ locationId, clientId, ...next })
    .onConflictDoUpdate({
      target: locationSettings.locationId,
      set: { ...next, updatedAt: new Date() },
    });
  await writeAudit(tx, {
    actor,
    clientId,
    locationId,
    action: "reputation.update_location_settings",
    input: { reviewUrlSet: next.reviewUrl !== null, requestDelayMinutes: next.requestDelayMinutes },
    decision: "executed",
  });
  return { ...current, ...next };
}

/** Invalidates every printed QR for the location. */
export async function rotateQr(tx: Tx, clientId: string, locationId: string, actor: Actor) {
  const current = await getLocationSettings(tx, locationId);
  const qrVersion = current.qrVersion + 1;
  await tx
    .insert(locationSettings)
    .values({ locationId, clientId, qrVersion })
    .onConflictDoUpdate({
      target: locationSettings.locationId,
      set: { qrVersion, updatedAt: new Date() },
    });
  await writeAudit(tx, {
    actor,
    clientId,
    locationId,
    action: "reputation.rotate_qr",
    output: { qrVersion },
    decision: "executed",
  });
  return qrVersion;
}
