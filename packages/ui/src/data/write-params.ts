"use client";

/**
 * Writes address parameters in ONE history entry (a null deletes one), then lets the range and
 * table hooks re-read the address the way they do for Back. `replace` swaps the current entry
 * instead of adding one, for a correction that Back should not return to.
 */
export function writeParams(
  changes: Record<string, string | null>,
  mode: "push" | "replace" = "push",
) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v) params.set(k, v);
    else params.delete(k);
  }
  const s = params.toString();
  const url = `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`;
  if (mode === "replace") window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new Event("popstate"));
}
