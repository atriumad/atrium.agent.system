"use client";

import { useEffect, useState } from "react";

/**
 * A copy of `value` that follows it after `ms` without a change. When `immediate(value)` is true
 * (an emptied search box, say) the copy is the value itself in the same render, with no delay.
 */
export function useDebounced<T>(value: T, ms: number, immediate?: (value: T) => boolean): T {
  const [settled, setSettled] = useState(value);
  const now = immediate?.(value) === true;
  useEffect(() => {
    if (now) {
      setSettled(value);
      return;
    }
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms, now]);
  return now ? value : settled;
}
