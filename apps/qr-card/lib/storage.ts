export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const CARD = "atr_card:";
const EMAIL = "atr_card_email:";
const HINT = "atr_card_hint";
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

function attempt<T>(fallback: T, fn: () => T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * The cards this device holds. Every call is safe on a storage that throws (Safari private
 * mode, blocked site data) or is missing: it then simply remembers nothing.
 */
export function cardStore(storage: StorageLike | null) {
  const get = (key: string): string | null => attempt(null, () => storage?.getItem(key) ?? null);
  const set = (key: string, value: string): void =>
    attempt(undefined, () => storage?.setItem(key, value));
  return {
    save(programId: string, token: string): void {
      if (TOKEN_RE.test(token)) set(CARD + programId, token);
    },
    load(programId: string): string | null {
      const token = get(CARD + programId);
      return token !== null && TOKEN_RE.test(token) ? token : null;
    },
    forget(programId: string): void {
      attempt(undefined, () => storage?.removeItem(CARD + programId));
    },
    list(): { programId: string; token: string }[] {
      return attempt([], () => {
        const out: { programId: string; token: string }[] = [];
        if (!storage) return out;
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key === null || !key.startsWith(CARD)) continue;
          const token = storage.getItem(key);
          if (token !== null && TOKEN_RE.test(token)) {
            out.push({ programId: key.slice(CARD.length), token });
          }
        }
        return out;
      });
    },
    emailDone(shortCode: string): boolean {
      return get(EMAIL + shortCode) !== null;
    },
    markEmailDone(shortCode: string): void {
      set(EMAIL + shortCode, "1");
    },
    hintDismissed(): boolean {
      return get(HINT) !== null;
    },
    dismissHint(): void {
      set(HINT, "1");
    },
  };
}
