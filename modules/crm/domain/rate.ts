export type Limit = { limit: number; windowSeconds: number };

/** Fixed-window limits. Each is `limit` hits per `windowSeconds`, counted per the key in its name. */
export const LIMITS = {
  /** Join attempts per IP address: 20 per hour. */
  joinPerIp: { limit: 20, windowSeconds: 3600 },
  /** New cards per device per program: 1 per day. */
  cardPerDevicePerDay: { limit: 1, windowSeconds: 86_400 },
  /** New cards per program, whoever joins: 200 per hour. */
  cardsPerProgramPerHour: { limit: 200, windowSeconds: 3600 },
  /** Card reads per card token: 120 per minute. */
  readsPerToken: { limit: 120, windowSeconds: 60 },
  /** Stamp attempts per staff user: 10 per minute. */
  stampsPerStaff: { limit: 10, windowSeconds: 60 },
} as const satisfies Record<string, Limit>;

export function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** `count` already includes the current hit. */
export function rateAllowed(count: number, limit: number): boolean {
  return count <= limit;
}

/** Seconds until the current window ends, between 1 and `windowSeconds`. */
export function retryAfterSeconds(now: Date, windowSeconds: number): number {
  const end = windowStart(now, windowSeconds).getTime() + windowSeconds * 1000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}
