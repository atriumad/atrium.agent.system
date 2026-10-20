export type KeyAction = "stamp" | "redeem" | "void";

/**
 * Idempotency keys for staff actions. The same (action, card) keeps one key until `settle`, so a
 * retry after a lost answer is the same request to the server, never a second stamp.
 */
export function createKeyRing(gen: () => string = () => crypto.randomUUID()) {
  const keys = new Map<string, string>();
  const id = (action: KeyAction, cardKey: string) => `${action}|${cardKey}`;
  return {
    keyFor(action: KeyAction, cardKey: string): string {
      const k = id(action, cardKey);
      let key = keys.get(k);
      if (key === undefined) {
        key = gen();
        keys.set(k, key);
      }
      return key;
    },
    settle(action: KeyAction, cardKey: string): void {
      keys.delete(id(action, cardKey));
    },
  };
}
