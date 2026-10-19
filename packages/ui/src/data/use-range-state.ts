"use client";

import { useCallback, useEffect, useState } from "react";
import type { RangeKey } from "../api";
import { writeParams } from "./write-params";

const RANGES: readonly RangeKey[] = ["7d", "30d", "90d"];

type View = { range: RangeKey; scopeId: string | null };

function read(scopeKey: string): View {
  const q = new URLSearchParams(window.location.search);
  const r = q.get("range");
  return {
    range: RANGES.includes(r as RangeKey) ? (r as RangeKey) : "30d",
    scopeId: q.get(scopeKey) || null,
  };
}

/**
 * The date range and the place (or client) a dashboard looks at, kept in the address so a link can
 * be shared and Back works. A sibling of `useTableState`: it owns only `range` and one scope key and
 * leaves every other query parameter as it found it.
 */
export function useRangeState(keys: { scope: "place" | "client" } = { scope: "place" }) {
  const scopeKey = keys.scope;
  const [view, setView] = useState<View>({ range: "30d", scopeId: null });

  useEffect(() => {
    const sync = () => setView(read(scopeKey));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [scopeKey]);

  const write = useCallback(
    (name: string, value: string | null) => {
      writeParams({ [name]: value }, "push", false);
      setView(read(scopeKey));
    },
    [scopeKey],
  );

  return {
    range: view.range,
    scopeId: view.scopeId,
    setRange: (r: RangeKey) => write("range", r),
    setScopeId: (id: string | null) => write(scopeKey, id),
  };
}
