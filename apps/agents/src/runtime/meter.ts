// apps/agents/src/runtime/meter.ts
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Counts the tokens one task spends. A task runs inside `run`; the model adapter adds to it; the
 * gateway reads `current` when it writes the audit entry. Two tasks at once never mix.
 */
export type UsageMeter = {
  run<T>(fn: () => Promise<T>): Promise<T>;
  add(tokens: number): void;
  current(): { tokens: number } | undefined;
};

export function createUsageMeter(): UsageMeter {
  const store = new AsyncLocalStorage<{ tokens: number }>();
  return {
    run: (fn) => store.run({ tokens: 0 }, fn),
    add(tokens) {
      const spent = store.getStore();
      if (spent) spent.tokens += tokens;
    },
    current() {
      const spent = store.getStore();
      return spent && spent.tokens > 0 ? { tokens: spent.tokens } : undefined;
    },
  };
}
