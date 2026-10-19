import type { Publish } from "@atrium/core";
import type { ACCENTS } from "../domain/loyalty";
import type { loyaltyPrograms } from "../infra/schema";

export type Accent = (typeof ACCENTS)[number];

export type CrmDeps = {
  /** Enqueues an event inside the transaction. `bus.publish` has this shape. */
  publish?: Publish;
  now?: () => Date;
  /** `LOYALTY_SECRET`: signs the join tokens. */
  secret: string;
  /** Replaces the short-code generator (tests inject collisions). */
  generateShortCode?: () => string;
};

export class LoyaltyForbiddenError extends Error {
  constructor(action: string) {
    super(`not allowed to ${action} the loyalty program`);
  }
}
export class InvalidProgramError extends Error {}

export type Program = {
  id: string;
  locationId: string;
  name: string;
  stampsRequired: number;
  rewardLabel: string;
  cooldownMinutes: number;
  active: boolean;
  accent: Accent;
  joinQrVersion: number;
};

export const clock = (deps: Pick<CrmDeps, "now">) => deps.now?.() ?? new Date();

export function envelope(clientId: string, locationId: string | null, at: Date) {
  return { id: crypto.randomUUID(), occurredAt: at.toISOString(), clientId, locationId };
}

export function toProgram(row: typeof loyaltyPrograms.$inferSelect): Program {
  return {
    id: row.id,
    locationId: row.locationId,
    name: row.name,
    stampsRequired: row.stampsRequired,
    rewardLabel: row.rewardLabel,
    cooldownMinutes: row.cooldownMinutes,
    active: row.active,
    accent: row.accent as Accent,
    joinQrVersion: row.joinQrVersion,
  };
}
