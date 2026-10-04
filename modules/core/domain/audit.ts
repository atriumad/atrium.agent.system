/**
 * Audit entries and personal-data masking. Docs: architecture / Agents and MCP (Audit log).
 * Inputs and outputs are stored masked, so erasing a guest never requires rewriting history.
 */
export const ACTOR_TYPES = ["user", "agent", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Who did it: a person, a subagent (`agent.subagent`) or the system itself. */
export type Actor = { type: ActorType; id: string; agentVersion?: number };

export const DECISIONS = ["executed", "pending_approval", "drafted", "rejected"] as const;
export type Decision = (typeof DECISIONS)[number];

export type AuditEntry = {
  actor: Actor;
  clientId: string | null;
  locationId?: string | null;
  /** A tool name or a use case: `reputation.open_case`, `core.set_package`. */
  action: string;
  input?: unknown;
  output?: unknown;
  decision: Decision;
  approverId?: string | null;
  reason?: string | null;
  cost?: { tokens?: number; cents?: number };
};

const MASK = "[masked]";

/** Keys whose value is a contact or a name, whatever it contains. */
const PERSONAL_KEYS =
  /^(e?-?mail|phone|mobile|tel|first_?name|last_?name|full_?name|name|address)$/i;

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g;
// US numbers in common separators, or an international number with a leading plus.
const PHONE = /(?:\+\d[\d\s().-]{7,14}\d|(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b)/g;

function maskString(value: string): string {
  return value.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}

/**
 * Returns a copy with personal data masked: values under personal keys are replaced, and emails
 * or phone numbers inside any free text are redacted. Ids, dates and numbers pass through.
 */
export function maskPersonalData(value: unknown, depth = 0): unknown {
  if (depth > 12) return MASK;
  if (typeof value === "string") return maskString(value);
  if (Array.isArray(value)) return value.map((item) => maskPersonalData(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = PERSONAL_KEYS.test(key) ? MASK : maskPersonalData(inner, depth + 1);
    }
    return out;
  }
  return value;
}
