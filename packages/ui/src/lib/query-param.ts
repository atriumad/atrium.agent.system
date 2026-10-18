"use client";

import { useEffect, useState } from "react";

/** One value from the address bar, or null on the server and when it is absent or empty. */
export function queryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(name);
  return value ? value : null;
}

/** The same value as a hook: read after mount, so a server-rendered page matches what the browser first draws. */
export function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => setValue(queryParam(name)), [name]);
  return value;
}

/** What a row needs to show it is the one a notification pointed at: marked, and scrolled into view. */
export function linkedRowProps(isLinked: boolean) {
  if (!isLinked) return {};
  return {
    "aria-current": "true" as const,
    className: "rounded-lg ring-2 ring-charcoal-800 ring-offset-2 dark:ring-cream-200",
    ref: (el: HTMLElement | null) => el?.scrollIntoView?.({ block: "center" }),
  };
}
