export type KeyAction = "stamp" | "redeem" | "void";

/** How long an in-doubt key may be retried. After it a new tap is a new action, not a replay. */
export const KEY_TTL_MS = 2 * 60 * 1000;

/**
 * Idempotency keys for staff actions. The same (action, card) keeps one key until `settle` or until
 * it is `ttlMs` old, so a retry after a lost answer is the same request to the server, never a
 * second stamp, while a later real action on the same card never replays an old event.
 */
export function createKeyRing(
  gen: () => string = () => crypto.randomUUID(),
  opts: { ttlMs?: number; now?: () => number } = {},
) {
  const ttl = opts.ttlMs ?? KEY_TTL_MS;
  const now = opts.now ?? Date.now;
  const keys = new Map<string, { key: string; at: number }>();
  const id = (action: KeyAction, cardKey: string) => `${action}|${cardKey}`;
  return {
    keyFor(action: KeyAction, cardKey: string): string {
      const k = id(action, cardKey);
      const at = now();
      const entry = keys.get(k);
      if (entry && at - entry.at < ttl) return entry.key;
      const key = gen();
      keys.set(k, { key, at });
      return key;
    },
    settle(action: KeyAction, cardKey: string): void {
      keys.delete(id(action, cardKey));
    },
  };
}
