export type LoyaltyEventKind = "stamp" | "reward_earned" | "reward_redeemed" | "void";

export type EventRow = {
  id: string;
  seq: number;
  kind: LoyaltyEventKind;
  at: Date;
  voidsId?: string;
};

export const ACCENTS = ["lime", "clay", "charcoal", "sage"] as const;

/**
 * Where a card stands. Events are read in order (at, seq), ascending; seq is the events
 * table's identity column, so events written with the same `at` still have a stable order. A `void` cancels the stamp it points to,
 * but only while that stamp is in the current cycle: a void whose target is before the last
 * `reward_earned` is ignored, because that cycle is already paid out.
 */
export function progress(
  events: EventRow[],
  _stampsRequired: number,
): {
  stampsInCycle: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
  rewardReady: boolean;
} {
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime() || a.seq - b.seq);
  let cycle = new Set<string>();
  let rewardsEarned = 0;
  let rewardsRedeemed = 0;
  for (const event of ordered) {
    if (event.kind === "stamp") cycle.add(event.id);
    else if (event.kind === "void") {
      if (event.voidsId) cycle.delete(event.voidsId);
    } else if (event.kind === "reward_earned") {
      rewardsEarned++;
      cycle = new Set();
    } else rewardsRedeemed++;
  }
  return {
    stampsInCycle: cycle.size,
    rewardsEarned,
    rewardsRedeemed,
    rewardReady: rewardsEarned > rewardsRedeemed,
  };
}

export function canStamp(input: {
  programActive: boolean;
  locationActive: boolean;
  cardClosed: boolean;
  lastStampAt: Date | null;
  cooldownMinutes: number;
  now: Date;
}): { ok: true } | { ok: false; reason: "paused" | "closed" | "cooldown"; retryAt?: Date } {
  if (!input.programActive || !input.locationActive) return { ok: false, reason: "paused" };
  if (input.cardClosed) return { ok: false, reason: "closed" };
  if (input.lastStampAt && input.cooldownMinutes > 0) {
    const retryAt = new Date(input.lastStampAt.getTime() + input.cooldownMinutes * 60_000);
    if (input.now.getTime() < retryAt.getTime()) return { ok: false, reason: "cooldown", retryAt };
  }
  return { ok: true };
}

/**
 * The stamp a void would cancel: the latest stamp of the current cycle that no void has
 * cancelled. A stamp from before the last `reward_earned` is paid out and cannot be voided.
 */
export function lastVoidableStamp(events: EventRow[]): EventRow | null {
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime() || a.seq - b.seq);
  let cycle: EventRow[] = [];
  for (const event of ordered) {
    if (event.kind === "stamp") cycle.push(event);
    else if (event.kind === "void") cycle = cycle.filter((s) => s.id !== event.voidsId);
    else if (event.kind === "reward_earned") cycle = [];
  }
  return cycle.at(-1) ?? null;
}
