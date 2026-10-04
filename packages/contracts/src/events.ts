import { z } from "zod";
import { PACKAGES } from "./packages";
import { SignalSource } from "./signals";

/**
 * Events are immutable, versioned past facts. Docs: architecture / Events and contracts.
 * Rules: ids only (never email or phone), `id` is the idempotency key, new shape = new version.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function defineEvent<
  const Type extends string,
  const Version extends number,
  const Shape extends z.ZodRawShape,
>(type: Type, version: Version, shape: Shape) {
  return z.object({
    type: z.literal(type),
    version: z.literal(version),
    /** Idempotency key: a consumer that sees the same id twice has one effect. */
    id: z.string().uuid(),
    occurredAt: z.string().datetime(),
    clientId: z.string().uuid(),
    locationId: z.string().uuid().nullable().default(null),
    data: z.strictObject(shape),
  });
}

export const SignalsIngestedV1 = defineEvent("signals.ingested", 1, {
  source: SignalSource,
  from: day,
  to: day,
  rowCount: z.number().int().positive(),
});

export const GuestIdentifiedV1 = defineEvent("guest.identified", 1, { guestId: z.string().uuid() });

export const ConsentChangedV1 = defineEvent("consent.changed", 1, {
  guestId: z.string().uuid(),
  channel: z.enum(["email", "sms"]),
  purpose: z.enum(["transactional", "marketing"]),
  granted: z.boolean(),
});

export const GuestErasedV1 = defineEvent("guest.erased", 1, { guestId: z.string().uuid() });

export const PackageChangedV1 = defineEvent("package.changed", 1, {
  previous: z.enum(PACKAGES).nullable(),
  current: z.enum(PACKAGES),
});

const itemType = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);

/** A proposal entered the approval queue. Notifications tell the people who can decide. */
export const ApprovalRequestedV1 = defineEvent("approval.requested", 1, {
  approvalId: z.string().uuid(),
  itemType,
  itemRef: z.string().min(1),
});

/** A person decided. The module that proposed it executes (or drops) the item. */
export const ApprovalDecidedV1 = defineEvent("approval.decided", 1, {
  approvalId: z.string().uuid(),
  itemType,
  itemRef: z.string().min(1),
  decision: z.enum(["approved", "discarded"]),
});

/** Every event the system knows. Add it here and to the catalog in the docs. */
export const EVENT_SCHEMAS = [
  SignalsIngestedV1,
  GuestIdentifiedV1,
  GuestErasedV1,
  ConsentChangedV1,
  PackageChangedV1,
  ApprovalRequestedV1,
  ApprovalDecidedV1,
] as const;

export type AtriumEvent = z.infer<(typeof EVENT_SCHEMAS)[number]>;
export type EventType = AtriumEvent["type"];
export const EVENT_TYPES = EVENT_SCHEMAS.map((schema) => schema.shape.type.value) as EventType[];

/** Keys that mean personal data. Events carry ids; the consumer asks Core for the contact. */
const PERSONAL_DATA_KEYS =
  /^(e?-?mail|phone|mobile|first_?name|last_?name|full_?name|name|address)$/i;

export function findPersonalDataKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPersonalDataKey(item);
      if (found) return found;
    }
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (PERSONAL_DATA_KEYS.test(key)) return key;
      const found = findPersonalDataKey(inner);
      if (found) return found;
    }
  }
  return null;
}

/** Parses a raw payload against its registered schema. Throws on an unknown type or version. */
export function parseEvent(raw: unknown): AtriumEvent {
  const probe = z.object({ type: z.string(), version: z.number() }).safeParse(raw);
  if (!probe.success) throw new Error("not an event: missing type or version");
  const schema = EVENT_SCHEMAS.find(
    (candidate) =>
      candidate.shape.type.value === probe.data.type &&
      candidate.shape.version.value === probe.data.version,
  );
  if (!schema) throw new Error(`unknown event: ${probe.data.type}@${probe.data.version}`);
  const event = schema.parse(raw);
  const personal = findPersonalDataKey(event.data);
  if (personal) throw new Error(`event ${event.type} carries personal data (${personal})`);
  return event;
}
