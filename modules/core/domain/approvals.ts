import { can, type Role } from "./roles";

/**
 * The approval queue: what an agent at level 3 proposes and a person decides.
 * Docs: architecture / Agents and MCP, agents / Autonomy.
 */
export const APPROVAL_STATUSES = ["pending", "approved", "discarded"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type ApprovalDecision = "approve" | "discard";

/** `reputation.reply`, `growth.campaign_launch`: module.thing, snake_case. */
export const ITEM_TYPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isValidItemType(value: string): boolean {
  return ITEM_TYPE.test(value);
}

/**
 * Who may decide. Approving is the same power as approving content: agency admins and account
 * managers for any client, and the client's owner for their own. Staff can view, not decide.
 */
export function canDecideApproval(role: Role): boolean {
  return can(role, "content", "approve");
}

export function isFinal(status: ApprovalStatus): boolean {
  return status !== "pending";
}
