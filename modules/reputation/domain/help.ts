/**
 * Help conversations. Docs: modules / Reputation (Help requests). Pure rules: who may close a
 * request as what, whose turn it is, and the short text shown in lists and notifications.
 */
export type HelpSide = "client" | "agency";
export type RequestStatus = "open" | "fulfilled" | "dismissed";

export const PREVIEW_MAX = 140;

/** The client can say it is solved; declining is the agency's call alone. */
export function canCloseAs(side: HelpSide, to: "fulfilled" | "dismissed"): boolean {
  return side === "agency" || to === "fulfilled";
}

/** The side that should answer next: the one that did not write last. Nobody, once closed. */
export function awaitingSide(
  status: RequestStatus,
  lastAuthorSide: HelpSide | null,
): HelpSide | null {
  if (status !== "open") return null;
  return lastAuthorSide === "agency" ? "client" : "agency";
}

/** One line of at most `max` characters: whitespace collapsed, cut with an ellipsis. */
export function preview(text: string, max: number = PREVIEW_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
