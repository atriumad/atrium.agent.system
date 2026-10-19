import type { Surface } from "./cases-app";

export const LIST: Record<Surface, string> = {
  manager: "/reputation/cases",
  platform: "/reputation/feedback",
};

/** The page of one case. `backSearch` is the list's query string, so Back can return to it. */
export function caseHref(surface: Surface, id: string, backSearch?: string): string {
  const path = `${LIST[surface]}/${encodeURIComponent(id)}`;
  return backSearch ? `${path}?back=${encodeURIComponent(backSearch)}` : path;
}

/**
 * The list of a surface, with the search a person came from. Only a plain query string is
 * appended to a fixed path, so nothing here can send a person to another site.
 */
export function listHref(surface: Surface, backParam: string | null): string {
  const ok =
    typeof backParam === "string" &&
    backParam.startsWith("?") &&
    backParam.length <= 500 &&
    !/[\u0000-\u001f\u007f#]/.test(backParam);
  return ok ? `${LIST[surface]}${backParam}` : LIST[surface];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An address from before a case had its own page (`?case=<id>`) becomes the case route,
 * keeping every other parameter. Null when the address names no case, or not a case id.
 */
export function redirectLegacyCase(surface: Surface, search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get("case");
  if (!id || !UUID.test(id)) return null;
  params.delete("case");
  const rest = params.toString();
  return `${caseHref(surface, id)}${rest ? `?${rest}` : ""}`;
}
