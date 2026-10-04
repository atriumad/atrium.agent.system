/**
 * Recovery cases. Docs: modules / Reputation (Recovery cases).
 * A case opens from a survey response, never from a public review guessed to belong to a guest.
 */
export type Severity = "low" | "medium" | "high";
export type CaseStatus = "open" | "contacted" | "resolved";

/** Rating 1 is a high-severity case, 2 medium, 3 low. A request to be contacted is at least low. */
export function severityFor(rating: number, wantsContact: boolean): Severity | null {
  if (rating <= 1) return "high";
  if (rating === 2) return "medium";
  if (rating === 3) return "low";
  return wantsContact ? "low" : null;
}

/**
 * A case opens for a rating of 1 to 3, or when the guest asks to be contacted and there is a way
 * to do it. An anonymous response that asks for contact but left no details opens nothing on its
 * own: a case that needs contact details needs the details.
 */
export function shouldOpenCase(input: {
  rating: number;
  wantsContact: boolean;
  hasContact: boolean;
}): boolean {
  if (input.rating <= 3) return true;
  return input.wantsContact && input.hasContact;
}

/** The first-response target: 24 hours. */
export const FIRST_RESPONSE_HOURS = 24;

export function caseDueAt(openedAt: Date): Date {
  return new Date(openedAt.getTime() + FIRST_RESPONSE_HOURS * 60 * 60 * 1000);
}

const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  open: ["contacted", "resolved"],
  contacted: ["resolved"],
  resolved: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isOverdue(input: { status: CaseStatus; dueAt: Date }, now: Date): boolean {
  return input.status === "open" && now.getTime() > input.dueAt.getTime();
}
