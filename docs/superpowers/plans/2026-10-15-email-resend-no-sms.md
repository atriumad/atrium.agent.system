# Email with Resend, no SMS, Sentiment on a real model: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the survey service real: email leaves through Resend with delivery tracking, bounce blocking and an unsubscribe link; SMS and Twilio are removed from schema, code and docs; Sentiment runs on a real model with its cost visible.

**Architecture:** SMS is removed first so Resend lands on a clean schema. A `resendTransport` implements the existing `NotificationTransport` port and is built from the environment in the API and the agents service. The review request gets a React Email template and an unsubscribe link. A signed webhook updates delivery status and records opt-outs. The owner's set-password link is also emailed.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/Postgres, React Email (`@react-email/components` 1.0.12, `@react-email/render` 2.1.0, React 19), Resend REST API, Next.js (Hub), Biome, dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-10-15-email-resend-no-sms-design.md`

## Global Constraints

- Work in `/Users/ventura/Desktop/d/atrium/atrium.resend`, branch `feat/resend-email`. Commit each task. End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.
- The worktree has no `node_modules` and no `.env.local`: run `bun install` first. Tests use the Postgres on `localhost:5432` with the default URLs written in the tests (docker is running); they need no env file. Never read or print any `.env.local`.
- Email is the only channel. No file under `apps`, `modules` or `packages` (migrations of the past and `apps/docs` excepted) may mention `sms`, `twilio` or `10dlc`, case-insensitive. A test enforces it.
- The guest's phone stays as a contact detail for the team to call. It is not a channel, has no consent record, and is shown on a case only when that response asked for contact (`wantsContact`).
- New migrations: core `0014_email_only.sql` and `0015_notification_delivery.sql`, reputation `0009_email_only.sql`, signals `0004_email_only.sql`. The pre-existing migrations are never edited.
- Names: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` (replaces `EMAIL_FROM_DOMAIN`). Outside development and test (`NODE_ENV` unset counts as production) the API and the agents service refuse to start without `RESEND_API_KEY` and `EMAIL_FROM`; the API also needs `RESEND_WEBHOOK_SECRET`.
- Delivery statuses: `recorded | sent | failed | delivered | bounced | complained`; a status never moves backwards (rank: recorded 0, failed 0, sent 1, delivered 2, bounced 3, complained 3).
- Resend: `POST https://api.resend.com/emails`, `Authorization: Bearer <key>`, header `Idempotency-Key`. A 4xx returns `failed`; a 429, 5xx, timeout or network failure throws `TransportUnavailableError` so the caller retries.
- Webhook: `POST /webhooks/resend`, Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`, secret `whsec_…`, HMAC-SHA256 over `id.timestamp.body`, base64, constant-time compare, 5-minute tolerance). Invalid or missing, 401, before the body is parsed.
- Unsubscribe token: `un1.<clientId>.<guestId>.<signature>`, HMAC with `SURVEY_SECRET`, never expires. Page `/u/<token>` on the Hub; the one-click POST is `<publicBaseUrl>/unsubscribe-api/<token>`, rewritten to the API `POST /u/:token`.
- No address, secret, token, set-password link or request body in any error, log or outbox row. The outbox keeps the masked address and the plain text only.
- Consent is checked in `sendToGuest` and nowhere else; a denial is a returned answer, not an error. The review link never depends on a rating or a reading (ADR 0018).
- Code style: Biome (`bunx biome check .`), TypeScript strict (`bun run typecheck`), boundaries (`bun run check:deps`). Match surrounding comment density and naming.

## Review Focus

1. **Webhook with a bad, missing, stale or tampered signature** is 401 and changes nothing (Task 6).
2. **Resend 5xx/429/network failure** throws, the Ask request stays `scheduled`, and the retry uses the same idempotency key (Tasks 3 and 5).
3. **Leaks:** the address, the API key, the unsubscribe token and the set-password link never reach an error, a log or the outbox (Tasks 3, 4 and 7).
4. **Unsubscribe token forgery:** a tampered, truncated or other-secret token is refused; repeating is harmless; an erased guest does not error (Task 4).
5. **A bounce blocks the next send** to that guest, and a delayed or soft event does not (Task 6).
6. **The migrations over existing data**, including `sms` rows and the partitioned signals table (Task 1).

---

### Task 1: Remove SMS from the schema and the code

**Files:**
- Create: `modules/core/migrations/0014_email_only.sql`, `modules/reputation/migrations/0009_email_only.sql`, `modules/signals/migrations/0004_email_only.sql`
- Create: `packages/config/tests/no-sms.test.ts`, `modules/core/tests/email-only.test.ts`
- Modify: `modules/core/domain/contact.ts`, `modules/core/domain/access.ts`, `modules/core/application/access.ts`, `modules/core/application/guests.ts`, `modules/core/infra/schema.ts`, `modules/core/index.ts`
- Modify: `modules/reputation/application/requests.ts`, `modules/reputation/application/survey.ts`, `modules/reputation/application/recovery.ts`, `modules/reputation/agents/host.ask.md`
- Modify: `packages/contracts/src/events.ts`, `packages/contracts/src/events.test.ts`, `packages/contracts/src/signals.ts`
- Modify tests: `modules/core/tests/{access,packages,notifications,guests,contact}.test.ts`, `modules/reputation/tests/flow.test.ts`, `packages/ui/tests/forms.test.tsx`

**Interfaces:**
- Produces (used by later tasks): `CHANNELS = ["email"]` (`Channel = "email"`); `phoneFor(tx: Tx, guestId: string): Promise<string | null>` exported from `@atrium/core`; consent sources `email_bounce` and `email_complaint` in `CONSENT_SOURCES`; `reputation.survey_invitations.channel in ('email','manual')`; no `sms_registered`.

- [ ] **Step 1: Install dependencies**

Run: `cd /Users/ventura/Desktop/d/atrium/atrium.resend && bun install`
Expected: completes; `git status` shows no tracked file changed (a `bun.lock` change is not expected).

- [ ] **Step 2: Write the failing guard and schema tests**

```ts
// packages/config/tests/no-sms.test.ts
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const ROOTS = ["apps", "modules", "packages"];
// Past migrations are history; the docs are checked by the docs build and their own test.
const SKIP_DIRS = new Set(["node_modules", ".next", "build", ".docusaurus", "migrations", "docs", "i18n", ".turbo"]);
const EXTENSIONS = [".ts", ".tsx", ".md", ".json", ".yaml", ".yml"];
// The tests that check for SMS have to name it.
const SELF_FILES = new Set([
  "packages/config/tests/no-sms.test.ts",
  "packages/config/tests/no-sms-docs.test.ts",
  "modules/core/tests/email-only.test.ts",
]);
const PATTERN = /sms|twilio|10dlc/i;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* files(path);
    } else if (EXTENSIONS.some((e) => name.endsWith(e))) {
      yield path;
    }
  }
}

describe("SMS is gone from the code", () => {
  test("no source, test, manifest or agent note mentions SMS, Twilio or 10DLC", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(join(ROOT, root))) {
        const rel = relative(ROOT, file);
        if (SELF_FILES.has(rel)) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (PATTERN.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
```

```ts
// modules/core/tests/email-only.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../../../scripts/migrate";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const admin = new SQL(ADMIN_URL);

beforeAll(async () => {
  await migrate(ADMIN_URL);
});
afterAll(async () => {
  await admin.close();
});

describe("the schema is email only", () => {
  test("no channel, source, invitation or signal check still allows SMS", async () => {
    const rows = (await admin.unsafe(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
         from pg_constraint
        where conname in ('consents_channel_check', 'consents_source_check', 'notifications_channel_check',
                          'survey_invitations_channel_check', 'signals_daily_signal_type_check')
          and conrelid::regclass::text not like '%\\_20%'`,
    )) as { tbl: string; conname: string; def: string }[];
    expect(rows.map((r) => r.conname).sort()).toEqual([
      "consents_channel_check",
      "consents_source_check",
      "notifications_channel_check",
      "signals_daily_signal_type_check",
      "survey_invitations_channel_check",
    ]);
    for (const row of rows) expect(row.def.toLowerCase()).not.toContain("sms");
    const source = rows.find((r) => r.conname === "consents_source_check")?.def ?? "";
    expect(source).toContain("email_bounce");
    expect(source).toContain("email_complaint");
  });

  test("the package table has no carrier registration column", async () => {
    const cols = (await admin.unsafe(
      `select column_name from information_schema.columns
        where table_schema = 'core' and table_name = 'client_packages'`,
    )) as { column_name: string }[];
    expect(cols.map((c) => c.column_name)).not.toContain("sms_registered");
  });
});
```

Add this test to `modules/core/tests/guests.test.ts` inside the existing top-level `describe`, using that file's own `db`, tenant id variable, `email(...)` helper and imports (add `phoneFor` and `eraseGuest` to the import from `../index` if they are not there yet):

```ts
  test("phoneFor gives the phone a guest left, and nothing for no phone, an unknown guest or an erased one", async () => {
    await withTenant(db, a, async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("phone-for"), phone: "713-555-0142" });
      expect(await phoneFor(tx, g)).toBe("+17135550142");
      const bare = await resolveGuest(tx, a, { email: email("no-phone") });
      expect(await phoneFor(tx, bare)).toBeNull();
      expect(await phoneFor(tx, crypto.randomUUID())).toBeNull();
      await eraseGuest(tx, g);
      expect(await phoneFor(tx, g)).toBeNull();
    });
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun test packages/config/tests/no-sms.test.ts modules/core/tests/email-only.test.ts modules/core/tests/guests.test.ts`
Expected: FAIL: the guard lists SMS hits; the schema test sees `sms`; `phoneFor` is not exported.

- [ ] **Step 4: Write the three migrations**

```sql
-- modules/core/migrations/0014_email_only.sql
-- Core · email is the only channel. SMS, its carrier registration and its consent source are gone.
-- There is no real client data yet, so rows of the old channel are deleted instead of converted.
delete from core.notifications where channel = 'sms';
delete from core.consents where channel = 'sms' or source = 'sms_stop';

alter table core.consents drop constraint consents_channel_check;
alter table core.consents add constraint consents_channel_check check (channel in ('email'));
alter table core.consents drop constraint consents_source_check;
alter table core.consents add constraint consents_source_check check (source in
  ('pos', 'wifi_portal', 'qr', 'checkout', 'survey', 'manual', 'import',
   'email_unsubscribe', 'email_bounce', 'email_complaint'));

alter table core.notifications drop constraint notifications_channel_check;
alter table core.notifications add constraint notifications_channel_check check (channel in ('email'));

alter table core.client_packages drop column sms_registered;
```

```sql
-- modules/reputation/migrations/0009_email_only.sql
-- Reputation · an invitation is sent by email or handed over by a person. SMS is gone.
update reputation.survey_invitations set channel = null where channel = 'sms';
alter table reputation.survey_invitations drop constraint survey_invitations_channel_check;
alter table reputation.survey_invitations
  add constraint survey_invitations_channel_check check (channel in ('email', 'manual'));
```

```sql
-- modules/signals/migrations/0004_email_only.sql
-- Signals · SMS deliveries are not a signal any more. Dropping the check on the partitioned parent
-- drops it on every partition; adding it back validates every partition.
delete from signals.signals_daily where signal_type = 'sms_delivered';
alter table signals.signals_daily drop constraint signals_daily_signal_type_check;
alter table signals.signals_daily add constraint signals_daily_signal_type_check check (signal_type in (
  'impression', 'reach_account', 'video_view', 'follower_add', 'discovery_search', 'engagement', 'save',
  'profile_visit', 'session', 'menu_view', 'link_click', 'email_open', 'email_click', 'direct_search',
  'direction', 'call', 'order_click', 'reserve_click', 'rsvp', 'qr_scan', 'order', 'reservation',
  'redemption', 'lead', 'loyalty_signup', 'repeat_visit', 'winback_visit', 'revenue', 'review',
  'review_reply', 'survey_score', 'rating_point', 'rank_point', 'opt_in', 'opt_out', 'spend',
  'agent_grade'));
```

- [ ] **Step 5: Change the core code**

In `modules/core/domain/contact.ts`: `export const CHANNELS = ["email"] as const;`; in `CONSENT_SOURCES` replace `"sms_stop",` with `"email_bounce", "email_complaint",` (one per line, after `"email_unsubscribe",`); replace the `CHANNEL_IDENTIFIER` body with `{ email: "email" }`.

In `modules/core/domain/access.ts`: delete `canSendSms` and the comment block directly above it (lines 81 to 87).

In `modules/core/application/access.ts`: remove `canSendSms` from the import on line 10; change the return on line 30 to `return { package: row.package };` (and its return type if it names `smsRegistered`); delete the whole `setSmsRegistered` function and its comment (from line 75); delete `smsAllowed` and its comment (from line 195).

In `modules/core/infra/schema.ts` delete line 81 (`smsRegistered: ...`). In `modules/core/index.ts` delete the lines exporting `setSmsRegistered` and `smsAllowed`, and add `phoneFor` to the export list of `./application/guests`.

In `modules/core/application/guests.ts` add (below `canContact`):

```ts
/**
 * The phone a guest left, for a person to call. It is not a channel: there is no consent record
 * and nothing is ever sent to it. The caller decides whether the guest asked to be contacted.
 */
export async function phoneFor(tx: Tx, guestId: string): Promise<string | null> {
  const guest = await loadGuest(tx, guestId);
  if (!guest || guest.erasedAt) return null;
  const [identifier] = await tx
    .select({ value: guestIdentifiers.value })
    .from(guestIdentifiers)
    .where(and(eq(guestIdentifiers.guestId, guestId), eq(guestIdentifiers.kind, "phone")))
    .orderBy(asc(guestIdentifiers.createdAt))
    .limit(1);
  return identifier?.value ?? null;
}
```

- [ ] **Step 6: Change the reputation code and the contracts**

In `modules/reputation/application/requests.ts`: remove `smsAllowed` from the core import; replace `chooseChannel` and its comment with:

```ts
/** Email only. A review request is a solicitation, so it needs marketing consent (pending legal review). */
async function chooseChannel(
  tx: Tx,
  guestId: string,
): Promise<{ channel: Channel } | { reason: string }> {
  const decision = await contactFor(tx, guestId, "email", "marketing");
  return decision.allowed ? { channel: "email" } : { reason: decision.reason };
}
```

change its call to `await chooseChannel(tx, request.guestId)`; replace the `body` constant with the email text only:

```ts
  const body = `Thanks for visiting ${location.name}.\n\nHow was your visit? It takes under a minute:\n${link}\n\nThe link works once and expires in 7 days.`;
```

In `modules/reputation/application/survey.ts` delete the line `if (input.contactPhone) await recordConsent(tx, guestId, "sms", "transactional", "survey");` (the phone is stored by `resolveGuest`; no consent record).

In `modules/reputation/application/recovery.ts` import `phoneFor` from `@atrium/core` (drop nothing else) and replace the contact block in `getCaseDetail` with:

```ts
  if (c.guestId) {
    const email = await contactFor(tx, c.guestId, "email", "transactional");
    // The phone is for a person to call, and only when this response asked to be contacted.
    const phone = r.wantsContact ? await phoneFor(tx, c.guestId) : null;
    if (email.allowed || phone) {
      contact = { email: email.allowed ? email.address : null, phone };
    }
  }
```

In `modules/reputation/agents/host.ask.md` replace the two lines `- When the time comes it sends, by email first, and by SMS only when the client's carrier` / `  registration is approved and the guest agreed to SMS.` with `- When the time comes it sends by email.` In `packages/contracts/src/events.ts` change both `channel: z.enum(["email", "sms"])` to `channel: z.enum(["email"])`; in `events.test.ts` line 109 change `channel: "sms"` to `channel: "email"`; in `signals.ts` delete the `"sms_delivered",` line.

- [ ] **Step 7: Update the existing tests to the email-only model**

- `modules/core/tests/access.test.ts`: remove `canSendSms` from the import and delete `describe("sms", ...)`.
- `modules/core/tests/packages.test.ts`: remove `setSmsRegistered` and `smsAllowed` from the imports; in the test "a client cannot add an override or register SMS" delete the `setSmsRegistered` expectation and rename the test "a client cannot add an override"; delete `describe("sms", ...)` (the block starting at line 181) entirely.
- `modules/core/tests/notifications.test.ts`: delete the test "sms needs a phone and a consent for sms, not just for email".
- `modules/core/tests/guests.test.ts`: delete the line asserting `contactFor(tx, g, "sms", "marketing")` inside the existing no-consent test; delete the three tests that record `sms` consent ("sms goes to the phone, not the email" and the two after it).
- `modules/core/tests/contact.test.ts`: in the `currentConsent` tests replace the `"sms"` channel with `"email"`.
- `modules/reputation/tests/flow.test.ts`: change `guestWithConsent` options to `{ email?: boolean }` and delete its `sms` phone and consent lines; delete the test "a guest who only agreed to SMS is not texted while SMS is not enabled for the client". Add this test next to the other recovery-detail tests, using the file's helpers (`respond` with `wantsContact`, `openCase`, `getCaseDetail`): a response with `wantsContact: true` and a guest with a phone shows `contact.phone`; the same guest on a response with `wantsContact: false` shows `contact: null` (or no phone).
- `packages/ui/tests/forms.test.tsx`: lines 112 to 116: change the radio `label="SMS" value="sms"` and its two assertions to `label="Phone" value="phone"`.

- [ ] **Step 8: Run the tests, types, lint and boundaries**

Run: `bun test packages/config modules packages/contracts packages/ui apps/api && bun run typecheck && bunx biome check --write . && bunx biome check . && bun run check:deps`
Expected: all pass. If the guard still lists hits, fix each one as the steps above (the hit names file and line); never weaken the guard.

- [ ] **Step 9: Commit**

```bash
git add -A modules packages apps/api apps/worker
git commit -m "refactor: remove SMS from the schema and the code

Email is the only channel. The phone stays as a contact detail for the team to call, shown on a
case only when the response asked for contact. Migrations delete the old rows; a test keeps SMS out.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Remove SMS and Twilio from the documentation; ADR 0021

**Files:**
- Create: `apps/docs/docs/adr/0021-resend-email-no-sms.md`, `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/adr/0021-resend-email-no-sms.md`
- Modify: `apps/docs/docs/adr/index.md` and the Spanish index; `apps/docs/docs/adr/0017-twilio-email-and-sms.md` and the Spanish one (status note)
- Modify: every other page that mentions SMS, Twilio or 10DLC (English and Spanish), found by the command below
- Create: `packages/config/tests/no-sms-docs.test.ts`

**Interfaces:** none (documentation). Produces the docs guard test.

- [ ] **Step 1: Write the failing docs guard**

```ts
// packages/config/tests/no-sms-docs.test.ts
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const DOCS = [join(ROOT, "apps/docs/docs"), join(ROOT, "apps/docs/i18n")];
const PATTERN = /sms|twilio|10dlc/i;
// History and the decision that retires the topic.
const ALLOWED = [
  "adr/0010-email-only-notifications.md",
  "adr/0017-twilio-email-and-sms.md",
  "adr/0021-resend-email-no-sms.md",
  "adr/index.md",
];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (name.endsWith(".md") || name.endsWith(".mdx")) yield path;
  }
}

describe("SMS is gone from the documentation", () => {
  test("only the ADRs that record the history mention SMS, Twilio or 10DLC", () => {
    const hits: string[] = [];
    for (const dir of DOCS) {
      for (const file of files(dir)) {
        const rel = relative(ROOT, file);
        if (ALLOWED.some((a) => rel.endsWith(a))) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (PATTERN.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
```

Run: `bun test packages/config/tests/no-sms-docs.test.ts`
Expected: FAIL with the list of pages (about 62 files, English and Spanish).

- [ ] **Step 2: Write ADR 0021 (English)**

```md
---
id: 0021-resend-email-no-sms
sidebar_position: 22
title: "0021 · Resend for email, no SMS"
sidebar_label: "0021 · Resend for email, no SMS"
description: "Resend for email, no SMS"
---

# ADR 0021: Resend for email, no SMS

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-15 | Atrium · product and technology |

:::note
Supersedes [0017](./0017-twilio-email-and-sms).
:::

## Context

ADR 0017 chose Twilio for email and SMS, with a carrier registration per restaurant before SMS could go live. Atrium will not send SMS, and the provider for email is now Resend. The notification door already hides the provider behind a port.

## Decision

Email is the only channel. Resend sends it, through the existing `NotificationTransport` port. A signed webhook records delivery, bounces and complaints; a bounce or a complaint withdraws that guest's consent. The review request carries an unsubscribe link, and an unsubscribe withdraws consent. SMS, Twilio and the carrier registration are removed from the schema, the code and the documentation. A guest's phone remains a contact detail for the team to call; it is not a channel.

## Consequences

- One provider, one webhook model, one channel.
- Email opens and clicks are not tracked yet; they arrive with marketing and CRM.
- A bounce stops all email to that guest, including a later survey invitation.
- The migration deletes the old SMS rows. This is acceptable only because there is no real client data yet.
- The API and the agents service refuse to start outside development without the Resend variables.

## Discarded alternatives

- Keeping SMS in the schema for later: it leaves dead code and a promise the product does not keep.
- Sending through the provider's SDK: a plain request is enough and easier to test.
- Tracking opens in transactional email: it needs a decision with marketing first.
```

- [ ] **Step 3: Write ADR 0021 (Spanish)**

```md
---
id: 0021-resend-email-no-sms
sidebar_position: 22
title: "0021 · Resend para el correo, sin SMS"
sidebar_label: "0021 · Resend para el correo, sin SMS"
description: "Resend para el correo, sin SMS"
---

# ADR 0021: Resend para el correo, sin SMS

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-15 | Atrium · producto y tecnología |

:::note
Reemplaza al [0017](./0017-twilio-email-and-sms).
:::

## Contexto

El ADR 0017 eligió Twilio para correo y SMS, con un registro ante las operadoras por restaurante antes de poder activar SMS. Atrium no enviará SMS, y el proveedor de correo ahora es Resend. La puerta de notificaciones ya esconde al proveedor detrás de un puerto.

## Decisión

El correo es el único canal. Lo envía Resend, a través del puerto `NotificationTransport` que ya existe. Un webhook firmado registra la entrega, los rebotes y las quejas; un rebote o una queja retira el consentimiento de ese guest. El pedido de reseña lleva un enlace de baja, y la baja retira el consentimiento. SMS, Twilio y el registro ante las operadoras se eliminan del esquema, del código y de la documentación. El teléfono del guest sigue siendo un dato de contacto para que el equipo llame; no es un canal.

## Consecuencias

- Un proveedor, un modelo de webhooks, un canal.
- Las aperturas y los clics del correo todavía no se miden; llegan con marketing y CRM.
- Un rebote detiene todo el correo a ese guest, incluida una invitación de encuesta posterior.
- La migración borra las filas viejas de SMS. Es aceptable solo porque todavía no hay datos reales de clients.
- La API y el servicio de agentes se niegan a arrancar fuera de desarrollo sin las variables de Resend.

## Alternativas descartadas

- Dejar SMS en el esquema para después: deja código muerto y una promesa que el producto no cumple.
- Enviar con el SDK del proveedor: una petición simple alcanza y es más fácil de probar.
- Medir aperturas en el correo transaccional: necesita una decisión previa con marketing.
```

- [ ] **Step 4: Register the ADR and retire 0017**

Append to the English `apps/docs/docs/adr/index.md` table after the 0020 row: `| [0021](./0021-resend-email-no-sms) | Resend for email, no SMS | Accepted |`, and to the Spanish index after its 0020 row: `| [0021](./0021-resend-email-no-sms) | Resend para el correo, sin SMS | Aceptada |`. In `0017-twilio-email-and-sms.md` change the status cell `**Accepted**` to `**Superseded by [0021](./0021-resend-email-no-sms)**`; in the Spanish 0017 change `**Aceptada**` to `**Reemplazada por [0021](./0021-resend-email-no-sms)**`. Also change the 0017 index row status in both indexes to `Superseded by 0021` / `Reemplazada por 0021`.

- [ ] **Step 5: Rewrite every other page**

List the pages: `grep -rIil "sms\|twilio\|10dlc" apps/docs/docs apps/docs/i18n | sort`. For each file, English and its Spanish twin together, apply these rules; the result must still read as a coherent page:

| Found | Do |
| --- | --- |
| A provider list or sentence naming Twilio for email | Name Resend for email |
| "email and SMS", "SMS and email" | "email" |
| A table row, bullet or section that is only about SMS (SMS blasts, SMS campaigns, SMS opt-outs, SMS redemptions, SMS delivered) | Delete it |
| 10DLC, carrier registration, `sms_registered`, "SMS goes live when registered" | Delete the sentence; if a table column held it, delete the column |
| The signal type `sms_delivered` | Delete its row |
| The `sms_stop` consent source | Replace with `email_bounce` and `email_complaint` where sources are listed |
| `Channel` or channel lists with `sms` | Only `email` |
| A package or service described as including SMS | Describe it without SMS; do not invent a replacement offer |
| The glossary entries for SMS-only terms | Delete the entries |

Do not touch `adr/0010`, `adr/0017` (other than Step 4), `adr/0021` and the indexes (other than Step 4).

- [ ] **Step 6: Verify**

Run: `bun test packages/config/tests/no-sms-docs.test.ts && bun run docs:build 2>&1 | tail -12`
Expected: the test passes; the build ends with static files generated for `en` and `es`, exit code 0 (a broken link or anchor from a deleted section fails it: fix each).

- [ ] **Step 7: Commit**

```bash
git add apps/docs packages/config
git commit -m "docs: ADR 0021, and SMS and Twilio out of the documentation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Delivery model, Resend transport and its wiring

**Files:**
- Create: `modules/core/migrations/0015_notification_delivery.sql`, `modules/core/infra/resend.ts`, `modules/core/infra/transport.ts`
- Modify: `modules/core/domain/notifications.ts`, `modules/core/application/notifications.ts`, `modules/core/infra/schema.ts`, `modules/core/index.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/survey.ts`, `apps/api/src/cases.ts`, `apps/api/src/surveys-admin.ts`, `apps/api/src/locations.ts`, `apps/api/src/onboarding.ts` (where they call module functions that send)
- Modify: `apps/agents/src/main.ts`, `.env.example`
- Test: `modules/core/tests/resend.test.ts` (new), `modules/core/tests/transport-env.test.ts` (new), `modules/core/tests/notifications.test.ts`

**Interfaces:**
- Produces (used by Tasks 5 to 7):
  - `type OutgoingMessage = { channel: Channel; to: string; subject: string | null; body: string; html: string | null; headers: Record<string, string> | null; idempotencyKey: string | null }`
  - `type DeliveryStatus = "recorded" | "sent" | "failed" | "delivered" | "bounced" | "complained"`; `type DeliveryResult = { status: DeliveryStatus; providerId: string | null }`; `NotificationTransport.deliver(message): Promise<DeliveryResult>`
  - `MessageDraft` gains optional `html`, `headers`, `idempotencyKey`, `storedBody` (the outbox text when it must differ from `body`)
  - `resendTransport(config: { apiKey: string; from: string; fetch?: typeof fetch; timeoutMs?: number }): NotificationTransport`; `class TransportUnavailableError extends Error { kind: "network" | "rate_limited" | "provider_error"; status?: number }`
  - `transportFromEnv(env: Record<string, string | undefined>): NotificationTransport`
  - `AppDeps.transport?: NotificationTransport` in `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// modules/core/tests/resend.test.ts
import { describe, expect, test } from "bun:test";
import { resendTransport, TransportUnavailableError } from "../infra/resend";

const message = {
  channel: "email" as const,
  to: "ana.lopez@mail.com",
  subject: "How was your visit?",
  body: "plain text",
  html: "<p>html</p>",
  headers: { "List-Unsubscribe": "<https://x.test/u>" },
  idempotencyKey: "req-1",
};
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the Resend transport", () => {
  test("posts the email with the key, the sender and the idempotency key, and returns the provider id", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const t = resendTransport({
      apiKey: "re_secret",
      from: "Atrium <no-reply@mail.test>",
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return reply(200, { id: "msg_1" });
      }) as unknown as typeof fetch,
    });
    expect(t.name).toBe("resend");
    expect(await t.deliver(message)).toEqual({ status: "sent", providerId: "msg_1" });
    expect(seen?.url).toBe("https://api.resend.com/emails");
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_secret");
    expect(headers["idempotency-key"]).toBe("req-1");
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      from: "Atrium <no-reply@mail.test>",
      to: ["ana.lopez@mail.com"],
      subject: "How was your visit?",
      text: "plain text",
      html: "<p>html</p>",
      headers: { "List-Unsubscribe": "<https://x.test/u>" },
    });
  });

  test("a message with no html, headers or idempotency key sends only what it has", async () => {
    let body = "";
    let headers: Record<string, string> = {};
    const t = resendTransport({
      apiKey: "k",
      from: "a@b.test",
      fetch: (async (_u: string, init: RequestInit) => {
        body = String(init.body);
        headers = init.headers as Record<string, string>;
        return reply(200, { id: "m" });
      }) as unknown as typeof fetch,
    });
    await t.deliver({ ...message, html: null, headers: null, idempotencyKey: null });
    expect(JSON.parse(body)).toEqual({
      from: "a@b.test",
      to: ["ana.lopez@mail.com"],
      subject: "How was your visit?",
      text: "plain text",
    });
    expect(headers["idempotency-key"]).toBeUndefined();
  });

  test("a 4xx is a failed delivery, not an error", async () => {
    const t = resendTransport({ apiKey: "k", from: "a@b.test", fetch: (async () => reply(422, { message: "bad address ana.lopez@mail.com" })) as unknown as typeof fetch });
    expect(await t.deliver(message)).toEqual({ status: "failed", providerId: null });
  });

  test("429, 5xx and network failures throw an error that carries no address and no key", async () => {
    const cases: [() => Promise<Response>, string, number | undefined][] = [
      [async () => reply(429, { message: "slow down ana.lopez@mail.com" }), "rate_limited", 429],
      [async () => reply(503, { message: "ana.lopez@mail.com re_secret" }), "provider_error", 503],
      [async () => { throw new TypeError("connect ECONNREFUSED ana.lopez@mail.com"); }, "network", undefined],
    ];
    for (const [fn, kind, status] of cases) {
      const t = resendTransport({ apiKey: "re_secret", from: "a@b.test", fetch: fn as unknown as typeof fetch });
      const error = (await t.deliver(message).then(() => null, (e: unknown) => e)) as TransportUnavailableError;
      expect(error).toBeInstanceOf(TransportUnavailableError);
      expect(error.kind).toBe(kind as TransportUnavailableError["kind"]);
      expect(error.status).toBe(status);
      expect(error.message).not.toContain("ana.lopez");
      expect(error.message).not.toContain("re_secret");
    }
  });
});
```

```ts
// modules/core/tests/transport-env.test.ts
import { describe, expect, test } from "bun:test";
import { devTransport } from "../domain/notifications";
import { transportFromEnv } from "../infra/transport";

describe("transportFromEnv", () => {
  test("Resend when the key and the sender are set", () => {
    expect(transportFromEnv({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.test" }).name).toBe("resend");
  });
  test("the development transport in development and test with no key", () => {
    expect(transportFromEnv({ NODE_ENV: "development" })).toBe(devTransport);
    expect(transportFromEnv({ NODE_ENV: "test" })).toBe(devTransport);
  });
  test("outside development, with NODE_ENV unset counting as production, a missing key or sender refuses to start", () => {
    expect(() => transportFromEnv({})).toThrow();
    expect(() => transportFromEnv({ NODE_ENV: "production" })).toThrow();
    expect(() => transportFromEnv({ NODE_ENV: "production", RESEND_API_KEY: "k" })).toThrow();
  });
  test("a key without a sender, or a sender without a key, is a mistake even in development", () => {
    expect(() => transportFromEnv({ NODE_ENV: "development", RESEND_API_KEY: "k" })).toThrow();
    expect(() => transportFromEnv({ NODE_ENV: "development", EMAIL_FROM: "a@b.test" })).toThrow();
  });
});
```

Add to `modules/core/tests/notifications.test.ts` (using that file's setup and fake-transport style) a test that a transport returning `{ status: "sent", providerId: "msg_9" }` leaves an outbox row with `status = 'sent'` and `provider_id = 'msg_9'`, and one that `storedBody` replaces `body` in the row while the transport receives the real `body`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test modules/core/tests/resend.test.ts modules/core/tests/transport-env.test.ts`
Expected: FAIL with "Cannot find module '../infra/resend'".

- [ ] **Step 3: Migration and schema**

```sql
-- modules/core/migrations/0015_notification_delivery.sql
-- Core · delivery tracking. The provider's message id lets a webhook find the row again, and the
-- status follows the message from sent to delivered, bounced or complained.
alter table core.notifications add column provider_id text;
create unique index notifications_provider_id_idx
  on core.notifications (provider_id) where provider_id is not null;
alter table core.notifications drop constraint notifications_status_check;
alter table core.notifications add constraint notifications_status_check
  check (status in ('recorded', 'sent', 'failed', 'delivered', 'bounced', 'complained'));
-- The webhook moves the status forward; nothing else about a sent message changes.
grant update (status) on core.notifications to atrium_app;
```

In `modules/core/infra/schema.ts`, in the `notifications` table add `providerId: text("provider_id"),` after `status`.

- [ ] **Step 4: The delivery model**

In `modules/core/domain/notifications.ts` replace `OutgoingMessage`, `DeliveryStatus`, `NotificationTransport` and `devTransport`, and extend `MessageDraft`:

```ts
/** What a transport delivers. The address is real; it never reaches the outbox table. */
export type OutgoingMessage = {
  channel: Channel;
  to: string;
  subject: string | null;
  body: string;
  /** The HTML version, when the message has one. The plain `body` is always present. */
  html: string | null;
  headers: Record<string, string> | null;
  /** The same key never sends twice, so a retry after a lost answer does not duplicate the email. */
  idempotencyKey: string | null;
};

export type DeliveryStatus = "recorded" | "sent" | "failed" | "delivered" | "bounced" | "complained";
export type DeliveryResult = { status: DeliveryStatus; providerId: string | null };

/** A way to deliver messages. The development transport records and sends nothing. */
export type NotificationTransport = {
  name: string;
  deliver(message: OutgoingMessage): Promise<DeliveryResult>;
};

export const devTransport: NotificationTransport = {
  name: "dev",
  deliver: async () => ({ status: "recorded", providerId: null }),
};

/** How far a message has got. A status never moves to a lower rank. */
export const STATUS_RANK: Record<DeliveryStatus, number> = {
  recorded: 0,
  failed: 0,
  sent: 1,
  delivered: 2,
  bounced: 3,
  complained: 3,
};
```

```ts
export type MessageDraft = {
  /** `module.thing`: `reputation.review_request`. */
  kind: string;
  subject?: string;
  body: string;
  html?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  /** What the outbox keeps when it must not hold `body` (a message that carries a secret link). */
  storedBody?: string;
};
```

In `modules/core/application/notifications.ts`, in both `sendToGuest` and `sendToUser`, replace the `transport.deliver({...})` call and the insert so they read:

```ts
  const result = await transport.deliver({
    channel: input.channel, // "email" in sendToUser
    to: contact.address, // user.email in sendToUser
    subject: input.subject ?? null,
    body: input.body,
    html: input.html ?? null,
    headers: input.headers ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });
```

and in the `.values({ ... })`: `body: input.storedBody ?? input.body, status: result.status, providerId: result.providerId,` (keep the other columns as they are). Export `STATUS_RANK`, `DeliveryResult`, `resendTransport`, `TransportUnavailableError` and `transportFromEnv` from `modules/core/index.ts`.

- [ ] **Step 5: The Resend transport and the environment factory**

```ts
// modules/core/infra/resend.ts
import type { NotificationTransport } from "../domain/notifications";

/**
 * The only error the transport lets out. A provider's own errors and a network error can carry the
 * address or the key, so this one holds a kind and a status and nothing else.
 */
export class TransportUnavailableError extends Error {
  readonly kind: "network" | "rate_limited" | "provider_error";
  readonly status?: number;
  constructor(kind: TransportUnavailableError["kind"], status?: number) {
    super(`email transport unavailable: ${kind}${status === undefined ? "" : ` (${status})`}`);
    this.name = "TransportUnavailableError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

export type ResendConfig = {
  apiKey: string;
  /** `Atrium <no-reply@mail.example.com>` */
  from: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** Sends through Resend's REST API. Docs: ADR 0021. A 4xx is a failed delivery; anything else throws. */
export function resendTransport(config: ResendConfig): NotificationTransport {
  const doFetch = config.fetch ?? fetch;
  return {
    name: "resend",
    async deliver(message) {
      let response: Response;
      try {
        response = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject ?? "",
            text: message.body,
            ...(message.html ? { html: message.html } : {}),
            ...(message.headers ? { headers: message.headers } : {}),
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
        });
      } catch {
        throw new TransportUnavailableError("network");
      }
      if (response.status === 429) throw new TransportUnavailableError("rate_limited", 429);
      if (response.status >= 500) throw new TransportUnavailableError("provider_error", response.status);
      if (!response.ok) return { status: "failed", providerId: null };
      const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
      return { status: "sent", providerId: typeof body?.id === "string" ? body.id : null };
    },
  };
}
```

```ts
// modules/core/infra/transport.ts
import { devTransport, type NotificationTransport } from "../domain/notifications";
import { resendTransport } from "./resend";

type Env = Record<string, string | undefined>;

/**
 * The transport a process uses. Resend when the key and the sender are set; the development
 * transport only in development and test. An unset NODE_ENV counts as production, so a process
 * that forgot its key refuses to start instead of silently recording mail it never sends.
 */
export function transportFromEnv(env: Env): NotificationTransport {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (apiKey && from) return resendTransport({ apiKey, from });
  if (apiKey || from) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set together");
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return devTransport;
  throw new Error("RESEND_API_KEY and EMAIL_FROM are required outside development and test");
}
```

- [ ] **Step 6: Wire it into the API and the agents service**

In `apps/api/src/app.ts` add to `AppDeps`: `/** How mail leaves. Without it the development transport records and sends nothing. */ transport?: NotificationTransport;` (import the type from `@atrium/core`). In `apps/api/src/server.ts` add `import { transportFromEnv } from "@atrium/core";` (merge with the existing core import) and `const transport = transportFromEnv(process.env);` before `createApp`, and pass `transport,` in the `createApp({...})` call. In `apps/agents/src/main.ts` build `const transport = transportFromEnv(process.env);` before `createAgentsService` and pass `transport,` there.

Thread `deps.transport` to every module call that can send. In `apps/api/src/survey.ts` (two `submitSurvey` option objects), `apps/api/src/cases.ts` (the `advanceCase` options) and `apps/api/src/surveys-admin.ts` (the shared `options` object) add `...(deps.transport ? { transport: deps.transport } : {}),` next to `publish`. Then run `grep -rIn "sendToUser\|sendToGuest" modules --exclude-dir=node_modules --exclude-dir=tests` and, for each caller that is reached from an API route without a transport parameter (`modules/core/application/locations.ts` is one), add an optional transport to its deps and pass `deps.transport` from `apps/api/src/locations.ts` and `apps/api/src/onboarding.ts` the same way.

In `.env.example` replace the `EMAIL_FROM_DOMAIN=` line (and its section comment) with:

```
# Email leaves through Resend. In development, leave the key and the sender empty to record mail
# without sending it. Outside development the API and the agents service refuse to start without them.
RESEND_API_KEY=
EMAIL_FROM=
# Resend signs its webhooks; the API needs the secret to accept them (whsec_...).
RESEND_WEBHOOK_SECRET=
```

- [ ] **Step 7: Fix callers of the old `deliver` return type and run everything**

Run: `grep -rIn "deliver" modules apps packages --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=docs` and update any fake transport in tests that returns a bare status string to return `{ status: "...", providerId: null }`.
Run: `bun test modules apps packages/contracts packages/config && bun run typecheck && bunx biome check --write . && bunx biome check . && bun run check:deps`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A modules apps packages .env.example
git commit -m "feat(core): Resend transport, delivery statuses, and the transport built from the environment

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Unsubscribe: token, API routes and the Hub page

**Files:**
- Create: `modules/core/domain/unsubscribe.ts`, `apps/api/src/unsubscribe.ts`, `apps/hub/app/u/[token]/page.tsx`, `apps/hub/app/u/[token]/unsubscribe-app.tsx`
- Modify: `modules/core/index.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/hub/next.config.ts`
- Test: `modules/core/tests/unsubscribe-token.test.ts`, `apps/api/tests/unsubscribe.test.ts`

**Interfaces:**
- Consumes: `recordOptOut(tx, guestId, "email", source)` and `withTenant` from `@atrium/core`; `AppDeps` (Task 3).
- Produces (used by Task 5): `signUnsubscribeToken(secret: string, clientId: string, guestId: string): string`, `verifyUnsubscribeToken(secret: string, token: string): { clientId: string; guestId: string } | null`; `AppDeps.unsubscribeSecret?: string`; API `GET /u/:token/info` (200 `{ ok: true }` or 404) and `POST /u/:token` (200 `{ ok: true }`, 404 for a bad token).

- [ ] **Step 1: Write the failing token test**

```ts
// modules/core/tests/unsubscribe-token.test.ts
import { describe, expect, test } from "bun:test";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../domain/unsubscribe";

const client = "0b2f1c4e-6a5d-4f0e-9a39-2f6f4b8d1c11";
const guest = "7c1d2e3f-0a1b-4c2d-8e3f-4a5b6c7d8e9f";

describe("unsubscribe tokens", () => {
  test("round trip, and the token names the client and the guest", () => {
    const token = signUnsubscribeToken("s3cret", client, guest);
    expect(token.startsWith("un1.")).toBe(true);
    expect(verifyUnsubscribeToken("s3cret", token)).toEqual({ clientId: client, guestId: guest });
  });

  test("another secret, a tampered id or signature, a truncated token and junk are refused", () => {
    const token = signUnsubscribeToken("s3cret", client, guest);
    expect(verifyUnsubscribeToken("other", token)).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", token.replace(guest, client))).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", `${token}x`)).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", token.slice(0, -4))).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", "un1.not-a-uuid.not-a-uuid.sig")).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", "")).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", "svy_abc")).toBeNull();
  });
});
```

Run: `bun test modules/core/tests/unsubscribe-token.test.ts`; Expected: FAIL (module not found).

- [ ] **Step 2: Implement the token**

```ts
// modules/core/domain/unsubscribe.ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The link in an email's footer. `un1.<clientId>.<guestId>.<signature>`, signed with a secret and
 * stored nowhere. It never expires: an unsubscribe link must keep working, and rotating the
 * secret revokes every link.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export function signUnsubscribeToken(secret: string, clientId: string, guestId: string): string {
  const payload = `un1.${clientId}.${guestId}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { clientId: string; guestId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "un1") return null;
  const [, clientId, guestId, signature] = parts as [string, string, string, string];
  if (!UUID.test(clientId) || !UUID.test(guestId)) return null;
  const expected = Buffer.from(sign(secret, `un1.${clientId}.${guestId}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { clientId, guestId };
}
```

Export both from `modules/core/index.ts`. Run the token test: Expected: PASS.

- [ ] **Step 3: Write the failing API test**

Mirror the harness at the top of `apps/api/tests/survey.test.ts` (migrate, a client, `createApp`), with the secret passed in `AppDeps`:

```ts
// apps/api/tests/unsubscribe.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  contactFor,
  createClient,
  createDatabase,
  recordConsent,
  resolveGuest,
  withAgency,
  withTenant,
} from "@atrium/core";
import { signUnsubscribeToken } from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const SECRET = "unsubscribe-test-secret";
const errors: unknown[] = [];
const app = createApp({ db, unsubscribeSecret: SECRET, onError: (e) => errors.push(e) });

let clientId: string;
let guestId: string;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    clientId = (await createClient(tx, { name: "Casa Olivo", slug: `unsub-olivo-${suffix}` })).id;
  });
  await withTenant(db, clientId, async (tx) => {
    guestId = await resolveGuest(tx, clientId, { email: `unsub-${suffix}@guest.test` });
    await recordConsent(tx, guestId, "email", "marketing", "qr");
    await recordConsent(tx, guestId, "email", "transactional", "qr");
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`unsub-%-${suffix}`}`),
  );
  await admin.close();
  await close();
  expect(errors).toEqual([]);
});

const allowed = () =>
  withTenant(db, clientId, async (tx) => (await contactFor(tx, guestId, "email", "marketing")).allowed);

describe("the unsubscribe routes", () => {
  test("a valid token confirms on GET info and withdraws consent on POST; repeating is harmless", async () => {
    const token = signUnsubscribeToken(SECRET, clientId, guestId);
    expect((await app.request(`/u/${token}/info`)).status).toBe(200);
    expect(await allowed()).toBe(true);
    const first = await app.request(`/u/${token}`, { method: "POST" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(await allowed()).toBe(false);
    const again = await app.request(`/u/${token}`, { method: "POST" });
    expect(again.status).toBe(200);
  });

  test("the one-click form post of a mail client (List-Unsubscribe=One-Click) works too", async () => {
    const guest2 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `unsub2-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const token = signUnsubscribeToken(SECRET, clientId, guest2);
    const res = await app.request(`/u/${token}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);
    expect(
      await withTenant(db, clientId, async (tx) => (await contactFor(tx, guest2, "email", "marketing")).allowed),
    ).toBe(false);
  });

  test("a tampered token, another secret and junk are 404 and change nothing", async () => {
    const g3 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `unsub3-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const good = signUnsubscribeToken(SECRET, clientId, g3);
    for (const bad of [`${good}x`, signUnsubscribeToken("other", clientId, g3), "junk", good.replace(g3, guestId)]) {
      expect((await app.request(`/u/${bad}`, { method: "POST" })).status).toBe(404);
      expect((await app.request(`/u/${bad}/info`)).status).toBe(404);
    }
    expect(
      await withTenant(db, clientId, async (tx) => (await contactFor(tx, g3, "email", "marketing")).allowed),
    ).toBe(true);
  });

  test("an erased guest is not an error", async () => {
    const g4 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `unsub4-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    await admin.unsafe("update core.guests set erased_at = now() where id = $1", [g4]);
    const res = await app.request(`/u/${signUnsubscribeToken(SECRET, clientId, g4)}`, { method: "POST" });
    expect(res.status).toBe(200);
  });

  test("without a secret the routes are not mounted", async () => {
    const bare = createApp({ db });
    expect((await bare.request(`/u/anything`, { method: "POST" })).status).toBe(404);
  });
});
```

Run: `bun test apps/api/tests/unsubscribe.test.ts`; Expected: FAIL.

- [ ] **Step 4: Implement the routes and mount them**

```ts
// apps/api/src/unsubscribe.ts
import { recordOptOut, verifyUnsubscribeToken, withTenant } from "@atrium/core";
import type { Hono } from "hono";
import type { AppDeps } from "./app";

/**
 * The page behind the footer link of an email. The token is the credential and names a guest in a
 * client; a bad token is a plain 404 that says nothing. A repeat is harmless, and an erased guest
 * has nothing left to withdraw, so both answer 200.
 */
export function mountUnsubscribe(app: Hono<any>, deps: AppDeps) {
  const secret = deps.unsubscribeSecret;
  if (!secret) return;

  app.get("/u/:token/info", (c) =>
    verifyUnsubscribeToken(secret, c.req.param("token"))
      ? c.json({ ok: true })
      : c.json({ error: "not_found" }, 404),
  );

  app.post("/u/:token", async (c) => {
    const who = verifyUnsubscribeToken(secret, c.req.param("token"));
    if (!who) return c.json({ error: "not_found" }, 404);
    try {
      await withTenant(deps.db, who.clientId, (tx) =>
        recordOptOut(tx, who.guestId, "email", "email_unsubscribe", {
          ...(deps.publish ? { publish: deps.publish } : {}),
        }),
      );
    } catch (error) {
      if (!(error instanceof Error && /unknown guest|was erased/.test(error.message))) throw error;
    }
    return c.json({ ok: true });
  });
}
```

In `apps/api/src/app.ts` add to `AppDeps`: `/** The secret that signs unsubscribe links. Without it the unsubscribe routes are not mounted. */ unsubscribeSecret?: string;` and next to `mountSurvey(app, deps);` add `mountUnsubscribe(app, deps);` with its import. In `apps/api/src/server.ts` pass `unsubscribeSecret: process.env.SURVEY_SECRET ?? secret,` in `createApp({...})`.

Run: `bun test apps/api/tests/unsubscribe.test.ts`; Expected: PASS. (If a test fails because `recordOptOut` throws a message that differs from the regex, read `setConsent` in `modules/core/application/guests.ts`: the messages are `"unknown guest"` and `"guest was erased"`.)

- [ ] **Step 5: The Hub page**

In `apps/hub/next.config.ts` add to the `rewrites` list: `{ source: "/unsubscribe-api/:token", destination: `${API_URL}/u/:token` }` and `{ source: "/unsubscribe-api/:token/info", destination: `${API_URL}/u/:token/info` }`.

```tsx
// apps/hub/app/u/[token]/page.tsx
import { UnsubscribeApp } from "./unsubscribe-app";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UnsubscribeApp token={token} />;
}
```

```tsx
// apps/hub/app/u/[token]/unsubscribe-app.tsx
"use client";

import { Button, Container, EmptyState } from "@atrium/ui";
import { useEffect, useState } from "react";

type State = "loading" | "ready" | "done" | "invalid" | "failed";

/** One confirmation, then consent is withdrawn. Repeating it is harmless. */
export function UnsubscribeApp({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const base = `/unsubscribe-api/${encodeURIComponent(token)}`;

  useEffect(() => {
    fetch(`${base}/info`)
      .then((res) => setState(res.ok ? "ready" : "invalid"))
      .catch(() => setState("failed"));
  }, [base]);

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(base, { method: "POST" });
      setState(res.ok ? "done" : "failed");
    } catch {
      setState("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="py-16">
      {state === "loading" ? null : state === "invalid" ? (
        <EmptyState title="This link is not valid">Check that you opened the whole link from the email.</EmptyState>
      ) : state === "done" ? (
        <EmptyState title="You are unsubscribed">You will not get more email from us. This is safe to repeat.</EmptyState>
      ) : state === "failed" ? (
        <EmptyState title="Something went wrong">Try again in a moment.</EmptyState>
      ) : (
        <EmptyState title="Stop emails from this restaurant?">
          <Button onClick={confirm} loading={busy}>
            Unsubscribe
          </Button>
        </EmptyState>
      )}
    </Container>
  );
}
```

Before relying on the imports, run `grep -n "Button\|Container\|EmptyState" packages/ui/src/index.ts`; if `Button` or `loading` is not exported or named differently, use what the index exports (the Hub's `survey-app.tsx` imports its components from `@atrium/ui`; copy its import style). Run `bun run typecheck` and `bun run --filter @atrium/hub build 2>&1 | tail -6` (or `next build` for the hub); Expected: compiles.

- [ ] **Step 6: Lint, boundaries, commit**

Run: `bunx biome check --write . && bunx biome check . && bun run check:deps && bun test modules/core apps/api`
Expected: pass.

```bash
git add -A modules apps
git commit -m "feat: unsubscribe links: signed token, API routes and the Hub page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The review-request email: template, unsubscribe link and idempotency

**Files:**
- Create: `packages/email/package.json`, `packages/email/tsconfig.json` (if other packages have one), `packages/email/src/review-request.tsx`, `packages/email/src/set-password.tsx`, `packages/email/src/render.ts`, `packages/email/src/index.ts`
- Modify: `modules/reputation/package.json`, `modules/reputation/application/requests.ts`, `modules/reputation/mcp/tools.ts`, `apps/agents/src/service.ts`, `apps/agents/src/main.ts`, `bun.lock`
- Test: `packages/email/tests/render.test.tsx`, `modules/reputation/tests/flow.test.ts`

**Interfaces:**
- Consumes: `signUnsubscribeToken` (Task 4); `MessageDraft.html/headers/idempotencyKey` (Task 3).
- Produces (Task 7 uses the second): `renderReviewRequest(input: { placeName: string; link: string; unsubscribeUrl: string | null }): Promise<{ html: string; text: string }>`, `renderSetPassword(input: { link: string }): Promise<{ html: string; text: string }>`; `ReputationToolConfig.unsubscribe?: { secret: string }`; the `sendReviewRequest` context gains `unsubscribeSecret?: string`.

- [ ] **Step 1: The package**

```json
// packages/email/package.json
{
  "name": "@atrium/email",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@react-email/components": "1.0.12",
    "@react-email/render": "2.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

Run `bun install` from the repo root; Expected: installs and changes `bun.lock`. Add `"@atrium/email": "workspace:*"` to `modules/reputation/package.json` dependencies and to `apps/api/package.json` (Task 7 uses it there), then `bun install` again.

- [ ] **Step 2: Write the failing render test**

```tsx
// packages/email/tests/render.test.tsx
import { describe, expect, test } from "bun:test";
import { renderReviewRequest, renderSetPassword } from "../src";

describe("review request email", () => {
  test("has the place, the survey link as a button, the unsubscribe link, and a plain text twin", async () => {
    const { html, text } = await renderReviewRequest({
      placeName: "Casa Olivo",
      link: "https://hub.test/s/svy_abc",
      unsubscribeUrl: "https://hub.test/u/un1.x",
    });
    expect(html).toContain("Casa Olivo");
    expect(html).toContain('href="https://hub.test/s/svy_abc"');
    expect(html).toContain('href="https://hub.test/u/un1.x"');
    expect(text).toContain("Casa Olivo");
    expect(text).toContain("https://hub.test/s/svy_abc");
    expect(text).toContain("https://hub.test/u/un1.x");
    expect(text).not.toContain("<");
  });

  test("a place name cannot inject markup", async () => {
    const { html } = await renderReviewRequest({
      placeName: "<script>alert(1)</script>",
      link: "https://hub.test/s/svy_abc",
      unsubscribeUrl: null,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  test("without an unsubscribe url there is no unsubscribe link", async () => {
    const { text } = await renderReviewRequest({ placeName: "Casa Olivo", link: "https://hub.test/s/x", unsubscribeUrl: null });
    expect(text.toLowerCase()).not.toContain("unsubscribe");
  });
});

describe("set-password email", () => {
  test("has the link as a button and in the text", async () => {
    const { html, text } = await renderSetPassword({ link: "https://platform.test/set-password?token=t" });
    expect(html).toContain('href="https://platform.test/set-password?token=t"');
    expect(text).toContain("https://platform.test/set-password?token=t");
  });
});
```

Run: `bun test packages/email`; Expected: FAIL (module not found).

- [ ] **Step 3: Implement the templates**

```tsx
// packages/email/src/review-request.tsx
import { Body, Button, Container, Head, Hr, Html, Link, Preview, Text } from "@react-email/components";

export type ReviewRequestProps = { placeName: string; link: string; unsubscribeUrl: string | null };

/** The email that asks a guest how the visit was. Docs: modules / Reputation. */
export function ReviewRequestEmail({ placeName, link, unsubscribeUrl }: ReviewRequestProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`How was your visit to ${placeName}?`}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#ffffff", color: "#111827" }}>
        <Container style={{ maxWidth: "480px", padding: "24px" }}>
          <Text style={{ fontSize: "18px", fontWeight: 600 }}>{`Thanks for visiting ${placeName}.`}</Text>
          <Text>How was your visit? It takes under a minute.</Text>
          <Button
            href={link}
            style={{ backgroundColor: "#111827", color: "#ffffff", padding: "12px 20px", borderRadius: "8px" }}
          >
            Tell us how it went
          </Button>
          <Text style={{ fontSize: "13px", color: "#6b7280" }}>The link works once and expires in 7 days.</Text>
          {unsubscribeUrl ? (
            <>
              <Hr />
              <Text style={{ fontSize: "12px", color: "#6b7280" }}>
                You got this because you visited {placeName}. <Link href={unsubscribeUrl}>Unsubscribe</Link>
              </Text>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
```

```tsx
// packages/email/src/set-password.tsx
import { Body, Button, Container, Head, Html, Preview, Text } from "@react-email/components";

/** The email that lets a new owner choose a password. The link is a credential: nothing stores it. */
export function SetPasswordEmail({ link }: { link: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Set your Atrium password</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#ffffff", color: "#111827" }}>
        <Container style={{ maxWidth: "480px", padding: "24px" }}>
          <Text style={{ fontSize: "18px", fontWeight: 600 }}>Welcome to Atrium.</Text>
          <Text>Your account was approved. Choose a password to sign in.</Text>
          <Button
            href={link}
            style={{ backgroundColor: "#111827", color: "#ffffff", padding: "12px 20px", borderRadius: "8px" }}
          >
            Set your password
          </Button>
          <Text style={{ fontSize: "13px", color: "#6b7280" }}>
            The link works once and expires soon. If you did not ask for this, ignore the email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

```ts
// packages/email/src/render.ts
import { render } from "@react-email/render";
import { ReviewRequestEmail, type ReviewRequestProps } from "./review-request";
import { SetPasswordEmail } from "./set-password";

export type Rendered = { html: string; text: string };

export async function renderReviewRequest(props: ReviewRequestProps): Promise<Rendered> {
  const element = ReviewRequestEmail(props);
  return { html: await render(element), text: await render(element, { plainText: true }) };
}

export async function renderSetPassword(props: { link: string }): Promise<Rendered> {
  const element = SetPasswordEmail(props);
  return { html: await render(element), text: await render(element, { plainText: true }) };
}
```

```ts
// packages/email/src/index.ts
export { type Rendered, renderReviewRequest, renderSetPassword } from "./render";
```

Run: `bun test packages/email`; Expected: PASS. If the plain-text output wraps long URLs across lines, the assertions on the link still hold because the renderer keeps URLs whole; if one fails, read the rendered text and adjust the assertion to the renderer's exact form, not the template.

- [ ] **Step 4: Use it in the review request**

In `modules/reputation/application/requests.ts`: import `{ signUnsubscribeToken }` from `@atrium/core` and `{ renderReviewRequest }` from `@atrium/email`; change the `context` parameter type of `sendReviewRequest` to `{ publicBaseUrl: string; unsubscribeSecret?: string }`; replace the `body` constant and the `sendToGuest` call with:

```ts
  const base = context.publicBaseUrl.replace(/\/$/, "");
  const unsub = context.unsubscribeSecret
    ? signUnsubscribeToken(context.unsubscribeSecret, request.clientId, request.guestId)
    : null;
  const { html, text } = await renderReviewRequest({
    placeName: location.name,
    link,
    unsubscribeUrl: unsub ? `${base}/u/${unsub}` : null,
  });
  const sent = await sendToGuest(
    tx,
    {
      clientId: request.clientId,
      guestId: request.guestId,
      channel: choice.channel,
      purpose: "marketing",
      kind: "reputation.review_request",
      subject: `How was your visit to ${location.name}?`,
      body: text,
      html,
      idempotencyKey: `review-request-${request.id}`,
      ...(unsub
        ? {
            headers: {
              "List-Unsubscribe": `<${base}/unsubscribe-api/${unsub}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    },
    deps.transport,
  );
```

(and delete the old `body` constant). In `modules/reputation/mcp/tools.ts` add to `ReputationToolConfig`: `/** Signs the unsubscribe link in a review request. Without it the email has no unsubscribe link. */ unsubscribe?: { secret: string };` and in the `send_review_request` handler pass `unsubscribeSecret: config.unsubscribe?.secret` inside the context given to `sendReviewRequest` (omit the key when undefined). In `apps/agents/src/service.ts` add `unsubscribeSecret?: string` to `AgentsServiceDeps` and pass `...(deps.unsubscribeSecret ? { unsubscribe: { secret: deps.unsubscribeSecret } } : {})` to `reputationTools`; in `apps/agents/src/main.ts` pass `...(process.env.SURVEY_SECRET ? { unsubscribeSecret: process.env.SURVEY_SECRET } : {})`; outside development refuse to start when `SURVEY_SECRET` is unset, with the same log-and-exit pattern as the token check.

- [ ] **Step 5: Tests for the send path**

In `modules/reputation/tests/flow.test.ts`, in the test that sends a review request through `sendReviewRequest` with a recording transport, assert: the transport received `html` containing the survey link and `body` equal to the plain text; when `unsubscribeSecret` is given the headers contain `List-Unsubscribe` with `/unsubscribe-api/un1.` and `List-Unsubscribe-Post`; the `idempotencyKey` is `review-request-<id>`; and the outbox row body equals the plain text (never the HTML). Add a test that a transport throwing `TransportUnavailableError` makes `sendReviewRequest` throw and leaves the request `scheduled`, and that calling it again sends with the same `idempotencyKey`. Update the existing assertions that compared the old body text.

- [ ] **Step 6: Run, lint, commit**

Run: `bun test packages/email modules/reputation apps/agents apps/worker && bun run typecheck && bunx biome check --write . && bunx biome check . && bun run check:deps`
Expected: pass. If dependency-cruiser objects to a module importing `packages/email`, add the narrowest allowance in `packages/config/dependency-cruiser.cjs` and say so in the commit.

```bash
git add -A packages modules apps bun.lock
git commit -m "feat(email): the review request goes out as an HTML email with an unsubscribe link

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Resend webhook: delivery status and blocking

**Files:**
- Create: `modules/core/domain/svix.ts`, `modules/core/application/delivery.ts`, `apps/api/src/webhooks.ts`
- Modify: `modules/core/index.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Test: `modules/core/tests/svix.test.ts`, `modules/core/tests/delivery.test.ts`, `apps/api/tests/webhooks.test.ts`

**Interfaces:**
- Consumes: `STATUS_RANK`, `provider_id` and the grant (Task 3); `recordOptOut`, `withAgency`, `withTenant`.
- Produces: `verifySvixSignature(input: { secret: string; id?: string; timestamp?: string; signature?: string; body: string; now: Date; toleranceSeconds?: number }): boolean`; `applyDeliveryEvent(db: Database, event: { type: "delivered" | "bounced" | "complained"; providerId: string }, deps?: { publish? }): Promise<"applied" | "ignored">`; `AppDeps.resendWebhookSecret?: string`; route `POST /webhooks/resend`.

- [ ] **Step 1: Write the failing signature test**

```ts
// modules/core/tests/svix.test.ts
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifySvixSignature } from "../domain/svix";

const secretBytes = Buffer.from("a-test-secret-with-some-length");
const SECRET = `whsec_${secretBytes.toString("base64")}`;
const NOW = new Date("2026-10-15T12:00:00Z");
const ts = String(Math.floor(NOW.getTime() / 1000));
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "m1" } });
const sig = (id: string, t: string, b: string) =>
  `v1,${createHmac("sha256", secretBytes).update(`${id}.${t}.${b}`).digest("base64")}`;
const base = { secret: SECRET, id: "msg_1", timestamp: ts, signature: sig("msg_1", ts, body), body, now: NOW };

describe("Svix signature", () => {
  test("a valid signature passes, and so does one among several", () => {
    expect(verifySvixSignature(base)).toBe(true);
    expect(verifySvixSignature({ ...base, signature: `v1,AAAA ${base.signature}` })).toBe(true);
  });
  test("a wrong secret, a tampered body, a different id and a bad version fail", () => {
    expect(verifySvixSignature({ ...base, secret: `whsec_${Buffer.from("other").toString("base64")}` })).toBe(false);
    expect(verifySvixSignature({ ...base, body: `${body} ` })).toBe(false);
    expect(verifySvixSignature({ ...base, id: "msg_2" })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: base.signature.replace("v1,", "v2,") })).toBe(false);
  });
  test("missing headers, a garbage timestamp and a stale or future timestamp fail", () => {
    expect(verifySvixSignature({ ...base, id: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, timestamp: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: undefined })).toBe(false);
    expect(verifySvixSignature({ ...base, timestamp: "abc" })).toBe(false);
    const old = String(Math.floor(NOW.getTime() / 1000) - 10 * 60);
    expect(verifySvixSignature({ ...base, timestamp: old, signature: sig("msg_1", old, body) })).toBe(false);
    const future = String(Math.floor(NOW.getTime() / 1000) + 10 * 60);
    expect(verifySvixSignature({ ...base, timestamp: future, signature: sig("msg_1", future, body) })).toBe(false);
  });
});
```

Run: `bun test modules/core/tests/svix.test.ts`; Expected: FAIL (module not found).

- [ ] **Step 2: Implement the signature check**

```ts
// modules/core/domain/svix.ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a webhook signed the Svix way, which is how Resend signs its events: HMAC-SHA256 over
 * `id.timestamp.body` with the secret's bytes, base64, in a header of space-separated `v1,<sig>`
 * entries. Constant-time compare; a timestamp outside the tolerance, in either direction, fails.
 */
export function verifySvixSignature(input: {
  secret: string;
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
  now: Date;
  toleranceSeconds?: number;
}): boolean {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds)) return false;
  if (Math.abs(input.now.getTime() / 1000 - seconds) > (input.toleranceSeconds ?? 300)) return false;
  const key = Buffer.from(input.secret.startsWith("whsec_") ? input.secret.slice(6) : input.secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.body}`).digest();
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}
```

Run the signature test; Expected: PASS.

- [ ] **Step 3: Write the failing delivery test**

```ts
// modules/core/tests/delivery.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createClient, createDatabase } from "../index";
import { applyDeliveryEvent, contactFor, recordConsent, resolveGuest, sendToGuest, withAgency, withTenant } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
let clientId: string;
let guestId: string;

const statusOf = async (providerId: string) =>
  ((await admin.unsafe("select status from core.notifications where provider_id = $1", [providerId])) as { status: string }[])[0]?.status;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    clientId = (await createClient(tx, { name: "Casa Olivo", slug: `delivery-${suffix}` })).id;
  });
  await withTenant(db, clientId, async (tx) => {
    guestId = await resolveGuest(tx, clientId, { email: `delivery-${suffix}@guest.test` });
    await recordConsent(tx, guestId, "email", "marketing", "qr");
  });
});
afterAll(async () => {
  await withAgency(db, (tx) => tx.execute(sql`delete from core.clients where slug like ${`delivery-${suffix}`}`));
  await admin.close();
  await close();
});

async function send(providerId: string) {
  await withTenant(db, clientId, (tx) =>
    sendToGuest(
      tx,
      { clientId, guestId, channel: "email", purpose: "marketing", kind: "reputation.review_request", subject: "s", body: "b" },
      { name: "fake", deliver: async () => ({ status: "sent", providerId }) },
    ),
  );
}

describe("delivery events", () => {
  test("delivered moves a sent message forward; a repeat and an older status change nothing", async () => {
    const id = `msg_${suffix}_a`;
    await send(id);
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: id })).toBe("applied");
    expect(await statusOf(id)).toBe("delivered");
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: id })).toBe("ignored");
  });

  test("an unknown provider id is ignored", async () => {
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: "msg_unknown" })).toBe("ignored");
  });

  test("a bounce marks the message and withdraws consent, so the next contact is denied", async () => {
    const id = `msg_${suffix}_b`;
    await send(id);
    expect(await withTenant(db, clientId, async (tx) => (await contactFor(tx, guestId, "email", "marketing")).allowed)).toBe(true);
    expect(await applyDeliveryEvent(db, { type: "bounced", providerId: id })).toBe("applied");
    expect(await statusOf(id)).toBe("bounced");
    const after = await withTenant(db, clientId, (tx) => contactFor(tx, guestId, "email", "marketing"));
    expect(after).toEqual({ allowed: false, reason: "opted_out" });
    const log = (await admin.unsafe("select source from core.consents where guest_id = $1 and granted = false order by seq desc limit 1", [guestId])) as { source: string }[];
    expect(log[0]?.source).toBe("email_bounce");
  });

  test("a complaint after a delivery moves it forward and records its own source", async () => {
    const g2 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `delivery2-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const id = `msg_${suffix}_c`;
    await withTenant(db, clientId, (tx) =>
      sendToGuest(tx, { clientId, guestId: g2, channel: "email", purpose: "marketing", kind: "reputation.review_request", subject: "s", body: "b" }, { name: "fake", deliver: async () => ({ status: "sent", providerId: id }) }),
    );
    await applyDeliveryEvent(db, { type: "delivered", providerId: id });
    expect(await applyDeliveryEvent(db, { type: "complained", providerId: id })).toBe("applied");
    expect(await statusOf(id)).toBe("complained");
    const log = (await admin.unsafe("select source from core.consents where guest_id = $1 and granted = false order by seq desc limit 1", [g2])) as { source: string }[];
    expect(log[0]?.source).toBe("email_complaint");
  });

  test("a status never moves backwards: delivered after a bounce is ignored", async () => {
    const g3 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `delivery3-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const id = `msg_${suffix}_d`;
    await withTenant(db, clientId, (tx) =>
      sendToGuest(tx, { clientId, guestId: g3, channel: "email", purpose: "marketing", kind: "reputation.review_request", subject: "s", body: "b" }, { name: "fake", deliver: async () => ({ status: "sent", providerId: id }) }),
    );
    await applyDeliveryEvent(db, { type: "bounced", providerId: id });
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: id })).toBe("ignored");
    expect(await statusOf(id)).toBe("bounced");
  });
});
```

Run: `bun test modules/core/tests/delivery.test.ts`; Expected: FAIL (`applyDeliveryEvent` not exported).

- [ ] **Step 4: Implement `applyDeliveryEvent`**

```ts
// modules/core/application/delivery.ts
import { eq } from "drizzle-orm";
import { STATUS_RANK } from "../domain/notifications";
import type { Database } from "../infra/db";
import { notifications } from "../infra/schema";
import { type GuestDeps, recordOptOut } from "./guests";
import { withAgency, withTenant } from "./scope";

export type DeliveryEvent = { type: "delivered" | "bounced" | "complained"; providerId: string };

/**
 * A provider told us what happened to a message. The status only moves forward. A bounce or a
 * complaint on a message to a guest withdraws that guest's email consent, so nothing is sent to
 * them again. An unknown message is ignored: the provider also reports mail from other tools.
 */
export async function applyDeliveryEvent(
  db: Database,
  event: DeliveryEvent,
  deps: GuestDeps = {},
): Promise<"applied" | "ignored"> {
  const row = await withAgency(db, async (tx) => {
    const [found] = await tx
      .select({
        id: notifications.id,
        clientId: notifications.clientId,
        status: notifications.status,
        recipientType: notifications.recipientType,
        recipientId: notifications.recipientId,
      })
      .from(notifications)
      .where(eq(notifications.providerId, event.providerId));
    if (!found) return null;
    if (STATUS_RANK[event.type] <= STATUS_RANK[found.status as keyof typeof STATUS_RANK]) return null;
    await tx.update(notifications).set({ status: event.type }).where(eq(notifications.id, found.id));
    return found;
  });
  if (!row) return "ignored";
  if (event.type !== "delivered" && row.recipientType === "guest") {
    const source = event.type === "bounced" ? "email_bounce" : "email_complaint";
    try {
      await withTenant(db, row.clientId, (tx) => recordOptOut(tx, row.recipientId, "email", source, deps));
    } catch (error) {
      // An erased guest has nothing left to withdraw.
      if (!(error instanceof Error && /unknown guest|was erased/.test(error.message))) throw error;
    }
  }
  return "applied";
}
```

`GuestDeps` is declared in `modules/core/application/guests.ts`: export it (`export type GuestDeps`) if it is not exported yet. Replace the `./scope` import with the module that exports `withAgency` and `withTenant` in this repo (`grep -rn "export.*withAgency" modules/core --exclude-dir=node_modules`). Export `applyDeliveryEvent` and `verifySvixSignature` from `modules/core/index.ts`. Run the delivery test; Expected: PASS.

- [ ] **Step 5: Write the failing API test and the route**

```ts
// apps/api/tests/webhooks.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createClient, createDatabase, recordConsent, resolveGuest, sendToGuest, withAgency, withTenant } from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";

const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL = process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const secretBytes = Buffer.from(`webhook-test-secret-${suffix}`);
const SECRET = `whsec_${secretBytes.toString("base64")}`;
const NOW = new Date("2026-10-15T12:00:00Z");
const errors: unknown[] = [];
const app = createApp({ db, resendWebhookSecret: SECRET, now: () => NOW, onError: (e) => errors.push(e) });
let clientId: string;
let guestId: string;

const signed = (payload: unknown, overrides: Record<string, string> = {}) => {
  const body = JSON.stringify(payload);
  const id = `evt_${crypto.randomUUID()}`;
  const ts = String(Math.floor(NOW.getTime() / 1000));
  const signature = `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
  return { body, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": signature, "content-type": "application/json", ...overrides } };
};
const post = (r: { body: string; headers: Record<string, string> }) => app.request("/webhooks/resend", { method: "POST", ...r });
const statusOf = async (providerId: string) =>
  ((await admin.unsafe("select status from core.notifications where provider_id = $1", [providerId])) as { status: string }[])[0]?.status;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    clientId = (await createClient(tx, { name: "Casa Olivo", slug: `hook-${suffix}` })).id;
  });
  await withTenant(db, clientId, async (tx) => {
    guestId = await resolveGuest(tx, clientId, { email: `hook-${suffix}@guest.test` });
    await recordConsent(tx, guestId, "email", "marketing", "qr");
    await sendToGuest(tx, { clientId, guestId, channel: "email", purpose: "marketing", kind: "reputation.review_request", subject: "s", body: "b" }, { name: "fake", deliver: async () => ({ status: "sent", providerId: `msg_${suffix}` }) });
  });
});
afterAll(async () => {
  await withAgency(db, (tx) => tx.execute(sql`delete from core.clients where slug like ${`hook-${suffix}`}`));
  await admin.close();
  await close();
  expect(errors).toEqual([]);
});

describe("POST /webhooks/resend", () => {
  test("no signature, a wrong one, a stale timestamp and a tampered body are 401 and change nothing", async () => {
    const good = signed({ type: "email.delivered", data: { email_id: `msg_${suffix}` } });
    expect((await app.request("/webhooks/resend", { method: "POST", body: good.body })).status).toBe(401);
    expect((await post({ ...good, headers: { ...good.headers, "svix-signature": "v1,AAAA" } })).status).toBe(401);
    expect((await post({ ...good, headers: { ...good.headers, "svix-timestamp": "1" } })).status).toBe(401);
    expect((await post({ ...good, body: good.body.replace("delivered", "bounced") })).status).toBe(401);
    expect(await statusOf(`msg_${suffix}`)).toBe("sent");
  });

  test("a signed delivered event updates the status; unknown ids and other event types answer 200", async () => {
    const delivered = await post(signed({ type: "email.delivered", data: { email_id: `msg_${suffix}` } }));
    expect(delivered.status).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("delivered");
    expect((await post(signed({ type: "email.delivered", data: { email_id: "msg_nope" } }))).status).toBe(200);
    expect((await post(signed({ type: "email.opened", data: { email_id: `msg_${suffix}` } }))).status).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("delivered");
  });

  test("a signed bounce marks the message and blocks the guest; a transient bounce changes nothing", async () => {
    const transient = await post(signed({ type: "email.bounced", data: { email_id: `msg_${suffix}`, bounce: { type: "Transient" } } }));
    expect(transient.status).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("delivered");
    const hard = await post(signed({ type: "email.bounced", data: { email_id: `msg_${suffix}`, bounce: { type: "Permanent" } } }));
    expect(hard.status).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("bounced");
    const rows = (await admin.unsafe("select granted from core.consents where guest_id = $1 order by seq desc limit 1", [guestId])) as { granted: boolean }[];
    expect(rows[0]?.granted).toBe(false);
  });

  test("an invalid JSON body with a valid signature is 400; without a secret the route is not mounted", async () => {
    const body = "not json";
    const id = "evt_x";
    const ts = String(Math.floor(NOW.getTime() / 1000));
    const signature = `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
    const res = await app.request("/webhooks/resend", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": signature } });
    expect(res.status).toBe(400);
    const bare = createApp({ db });
    expect((await bare.request("/webhooks/resend", { method: "POST", body: "{}" })).status).toBe(404);
  });
});
```

```ts
// apps/api/src/webhooks.ts
import { applyDeliveryEvent, verifySvixSignature } from "@atrium/core";
import type { Hono } from "hono";
import type { AppDeps } from "./app";

const EVENTS = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
} as const;

/**
 * Resend's events. Public, but signed: nothing is parsed before the signature checks out, and an
 * event cannot change anything else than the status of a message we sent. Opens and clicks are
 * not handled. A transient bounce is a delay, not a verdict, so it changes nothing.
 */
export function mountWebhooks(app: Hono<any>, deps: AppDeps) {
  const secret = deps.resendWebhookSecret;
  if (!secret) return;

  app.post("/webhooks/resend", async (c) => {
    const body = await c.req.text();
    const valid = verifySvixSignature({
      secret,
      id: c.req.header("svix-id"),
      timestamp: c.req.header("svix-timestamp"),
      signature: c.req.header("svix-signature"),
      body,
      now: deps.now?.() ?? new Date(),
    });
    if (!valid) return c.json({ error: "unauthorized" }, 401);

    let event: { type?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown } } };
    try {
      event = JSON.parse(body);
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    const type = typeof event.type === "string" ? EVENTS[event.type as keyof typeof EVENTS] : undefined;
    const providerId = event.data?.email_id;
    if (!type || typeof providerId !== "string") return c.json({ ok: true });
    if (type === "bounced" && event.data?.bounce?.type === "Transient") return c.json({ ok: true });

    await applyDeliveryEvent(deps.db, { type, providerId }, {
      ...(deps.publish ? { publish: deps.publish } : {}),
    });
    return c.json({ ok: true });
  });
}
```

In `apps/api/src/app.ts` add `resendWebhookSecret?: string;` to `AppDeps` (with a one-line comment) and `mountWebhooks(app, deps);` next to the other public mounts; in `apps/api/src/server.ts` pass `resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,` (omit when unset) and, outside development and test, exit with a logged reason when it is unset (same pattern as other required variables). The `/webhooks` path must be reachable without the session middleware: confirm by running the test.

- [ ] **Step 6: Run, lint, commit**

Run: `bun test modules/core apps/api && bun run typecheck && bunx biome check --write . && bunx biome check . && bun run check:deps`
Expected: pass.

```bash
git add -A modules apps
git commit -m "feat: Resend webhook: delivery status and blocking on bounce or complaint

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The set-password email

**Files:**
- Create: `apps/api/src/setup-email.ts`
- Modify: `modules/core/application/setup-link.ts`, `apps/api/src/server.ts`
- Test: `modules/core/tests/setup-link.test.ts` (new or the existing file for it), `apps/api/tests/setup-email.test.ts`

**Interfaces:**
- Consumes: `renderSetPassword` (Task 5); `NotificationTransport`, `maskAddress` (Task 3).
- Produces: `createSetupLinkCapture(options?: { deliver?: (input: { email: string; url: string }) => Promise<void> })`: `onPasswordSetup` still captures the link, then calls `deliver`, swallowing its errors; `sendSetPasswordEmail(transport, input: { email: string; url: string }, log): Promise<void>` in `apps/api/src/setup-email.ts`.
- Deviation from the spec, on purpose: the spec said the outbox keeps a body without the link. At the moment Better Auth hands over the link there is no client to attach an outbox row to (`notifications.client_id` is required), so this email is **not recorded in the outbox at all**; only a masked log line is written. The spec's wording is corrected in Step 3.

- [ ] **Step 1: Write the failing tests**

```ts
// modules/core/tests/setup-link.test.ts
import { describe, expect, test } from "bun:test";
import { createSetupLinkCapture } from "../application/setup-link";

describe("the set-password capture", () => {
  test("captures the link for the approver and also hands it to delivery", async () => {
    const delivered: { email: string; url: string }[] = [];
    const capture = createSetupLinkCapture({ deliver: async (i) => void delivered.push(i) });
    await capture.onPasswordSetup({ email: "Owner@Mail.com", url: "https://p.test/set?t=1" });
    expect(capture.take("owner@mail.com")).toBe("https://p.test/set?t=1");
    expect(delivered).toEqual([{ email: "Owner@Mail.com", url: "https://p.test/set?t=1" }]);
  });

  test("a delivery failure never loses the link or fails the approval", async () => {
    const capture = createSetupLinkCapture({ deliver: async () => { throw new Error("mail down for owner@mail.com"); } });
    await capture.onPasswordSetup({ email: "owner@mail.com", url: "https://p.test/set?t=2" });
    expect(capture.take("owner@mail.com")).toBe("https://p.test/set?t=2");
  });

  test("without delivery it behaves as before", async () => {
    const capture = createSetupLinkCapture();
    await capture.onPasswordSetup({ email: "a@b.test", url: "https://p.test/x" });
    expect(capture.take("a@b.test")).toBe("https://p.test/x");
    expect(capture.take("a@b.test")).toBeUndefined();
  });
});
```

```ts
// apps/api/tests/setup-email.test.ts
import { describe, expect, test } from "bun:test";
import type { OutgoingMessage } from "@atrium/core";
import { sendSetPasswordEmail } from "../src/setup-email";

describe("the set-password email", () => {
  test("goes to the owner with the link in both versions and an idempotency key, and logs only a masked address", async () => {
    const sent: OutgoingMessage[] = [];
    const logs: string[] = [];
    await sendSetPasswordEmail(
      { name: "fake", deliver: async (m) => (sent.push(m), { status: "sent", providerId: "m" }) },
      { email: "ana.lopez@mail.com", url: "https://platform.test/set-password?token=t" },
      { info: (m, f) => void logs.push(JSON.stringify({ m, f })), error: (m, f) => void logs.push(JSON.stringify({ m, f })) },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ana.lopez@mail.com");
    expect(sent[0]?.subject).toBe("Set your Atrium password");
    expect(sent[0]?.html).toContain("https://platform.test/set-password?token=t");
    expect(sent[0]?.body).toContain("https://platform.test/set-password?token=t");
    expect(sent[0]?.idempotencyKey).toMatch(/^set-password-/);
    const logged = logs.join("\n");
    expect(logged).not.toContain("ana.lopez");
    expect(logged).not.toContain("token=t");
  });

  test("a failed delivery is logged without the address or the link and does not throw", async () => {
    const logs: string[] = [];
    await sendSetPasswordEmail(
      { name: "fake", deliver: async () => { throw new Error("down for ana.lopez@mail.com https://x?token=t"); } },
      { email: "ana.lopez@mail.com", url: "https://platform.test/set-password?token=t" },
      { info: (m) => void logs.push(m), error: (m, f) => void logs.push(JSON.stringify({ m, f })) },
    );
    expect(logs.join("\n")).not.toContain("ana.lopez");
    expect(logs.join("\n")).not.toContain("token=t");
  });
});
```

Run: `bun test modules/core/tests/setup-link.test.ts apps/api/tests/setup-email.test.ts`; Expected: FAIL.

- [ ] **Step 2: Implement**

Replace `modules/core/application/setup-link.ts` with:

```ts
/**
 * Holds the one-time set-password link Better Auth builds for a new owner, long enough for the
 * approver to read it back, and hands it to delivery so the owner gets it by email too. A delivery
 * that fails never loses the link or fails the approval: the approver can still read it back.
 */
export type SetupLinkCapture = ReturnType<typeof createSetupLinkCapture>;

export type SetupLinkOptions = {
  deliver?: (input: { email: string; url: string }) => Promise<void>;
};

export function createSetupLinkCapture(options: SetupLinkOptions = {}) {
  const links = new Map<string, string>();
  return {
    onPasswordSetup: async ({ email, url }: { email: string; url: string }) => {
      links.set(email.toLowerCase(), url);
      try {
        await options.deliver?.({ email, url });
      } catch {
        // The link is already kept for the approver; delivery logs its own failure.
      }
    },
    take(email: string): string | undefined {
      const key = email.toLowerCase();
      const url = links.get(key);
      links.delete(key);
      return url;
    },
  };
}
```

```ts
// apps/api/src/setup-email.ts
import { maskAddress, type NotificationTransport } from "@atrium/core";
import { renderSetPassword } from "@atrium/email";

type Log = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

/**
 * Emails a new owner the link to choose a password. The link is a credential, so nothing stores it:
 * not the outbox, not a log. A failure is logged with the masked address and a kind, never thrown.
 */
export async function sendSetPasswordEmail(
  transport: NotificationTransport,
  input: { email: string; url: string },
  log: Log,
): Promise<void> {
  try {
    const { html, text } = await renderSetPassword({ link: input.url });
    await transport.deliver({
      channel: "email",
      to: input.email,
      subject: "Set your Atrium password",
      body: text,
      html,
      headers: null,
      idempotencyKey: `set-password-${crypto.randomUUID()}`,
    });
    log.info("setup_email.sent", { to: maskAddress(input.email) });
  } catch (error) {
    log.error("setup_email.failed", {
      to: maskAddress(input.email),
      kind: error instanceof Error ? error.name : "unknown",
    });
  }
}
```

In `apps/api/src/server.ts` build the capture with delivery: `const setup = createSetupLinkCapture({ deliver: (input) => sendSetPasswordEmail(transport, input, apiLog) });` where `apiLog` is a small object over `console.log`/`console.error` writing JSON lines, as `server.ts` already logs. Export `maskAddress` and the `OutgoingMessage` type from `modules/core/index.ts` if they are not exported yet.

- [ ] **Step 3: Correct the spec, run, lint, commit**

In `docs/superpowers/specs/2026-10-15-email-resend-no-sms-design.md`, section "5. Set-password email", replace the sentence "The link is a credential, so the outbox stores a body without it (\"A link to set your password was sent\"). The real body goes only to the transport." with "The link is a credential, so this email is not recorded in the outbox at all (there is no client to attach a row to at that moment); only a masked log line is written."

Run: `bun test modules/core apps/api && bun run typecheck && bunx biome check --write . && bunx biome check . && bun run check:deps`
Expected: pass.

```bash
git add -A modules apps docs/superpowers/specs
git commit -m "feat: email the owner the set-password link when an account is approved

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Documentation for the new behavior, live verification and Sentiment on a real model

**Files:**
- Modify (English and Spanish): `apps/docs/docs/modules/core.md`, `apps/docs/docs/modules/reputation.md`, `apps/docs/docs/guides/local-development.md`, `apps/docs/docs/product/using-the-system.md`, `apps/docs/docs/adr/0019-llm-provider-behind-a-port.md`
- Modify: `.env.example` (only if a name is missing)

**Interfaces:** none. This task needs the user's keys; it ends with a report of what was and was not verified.

- [ ] **Step 1: Document the behavior (English and Spanish)**

- `modules/core.md`, Notifications section: email only, through Resend (ADR 0021); the delivery statuses `sent`, `delivered`, `bounced`, `complained`; the signed webhook `POST /webhooks/resend`; a bounce or a complaint withdraws consent; the outbox keeps the masked address and the plain text only; the transport is built from `RESEND_API_KEY` and `EMAIL_FROM` and the development transport exists only in development and test. Find the section with `grep -n "otification" apps/docs/docs/modules/core.md`.
- `modules/reputation.md`, "Final screen" neighbors: the review request is an HTML email with a button, a plain-text version, an unsubscribe link in the footer and the `List-Unsubscribe` headers; the unsubscribe page is `/u/<token>` on the Hub and withdraws email consent; a guest who bounced or unsubscribed gets no more requests.
- `guides/local-development.md`: add `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` and `SURVEY_SECRET` to the variable notes; say that without the key and `NODE_ENV=development` mail is recorded and not sent, and that the webhook cannot reach a local machine so a signed fixture is used; add `NODE_ENV=development` to the first-start notes if it is not there.
- `product/using-the-system.md`: step 2 of the main flow says the guest gets an email "sent through Resend", with an unsubscribe link; the onboarding section says the owner also receives the set-password link by email.
- `adr/0019-llm-provider-behind-a-port.md`: leave a heading `## Model in use` at the end, empty, to be filled in Step 5.

Run: `bun test packages/config && bun run docs:build 2>&1 | tail -10`; Expected: pass; both languages build.

- [ ] **Step 2: Commit the docs**

```bash
git add apps/docs
git commit -m "docs: email delivery, webhook, unsubscribe and set-password email

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Full checks**

Run: `bun run ci`
Expected: lint, boundaries, typecheck and all tests pass. Report the counts.

- [ ] **Step 4: Ask the user for the keys, and wait**

Ask the user to put these in the `.env.local` that the services read (do not read or edit it yourself): `RESEND_API_KEY`, `EMAIL_FROM` (Resend's sandbox sender works before a domain is verified, to the account owner's address only), `RESEND_WEBHOOK_SECRET` (any `whsec_` value is fine locally), `SURVEY_SECRET` (a long random string), `AGENTS_SERVICE_TOKEN` (32+ characters), `AGENTS_URL=http://localhost:3005`, `PUBLIC_BASE_URL`, `NODE_ENV=development`, and for Sentiment `HOST_LLM_API_KEY` plus `HOST_MODEL_SENTIMENT` (or `HOST_MODEL_DEFAULT`). Remove `EMAIL_FROM_DOMAIN`. Also the user's own email address to receive the test mail.

- [ ] **Step 5: Live verification**

Start the API, the agents service, the worker, the Hub, the Manager and the Platform from this worktree with the user's env file (`bun --env-file=<path> run --filter ...`). The Postgres is the docker one on `localhost:5432`.
1. **Review request:** run the seed (`bun --env-file=<path> apps/worker/scripts/seed.ts`), make the demo guest's email the user's address, send an order through `/v1/signals`, and confirm the email arrives in the inbox with the button, the plain-text alternative and the footer link, and that `core.notifications` has `transport = 'resend'`, `status = 'sent'` and a `provider_id`.
2. **Unsubscribe:** open the footer link, confirm, and see `core.consents` hold a `granted = false` row with source `email_unsubscribe`; send another order and see no new email.
3. **Webhook:** post a signed `email.delivered` and then a signed `email.bounced` fixture for that `provider_id` to the local API (compute the signature with the same HMAC the tests use) and see the status change and consent withdrawn.
4. **Set-password email:** approve a request-access submission from the user's address in the Manager and confirm the email arrives.
5. **Sentiment:** run `bun --env-file=<path> apps/agents/scripts/eval-sentiment.ts` and record the pass count; answer a survey with a comment and confirm `survey_responses` gets labels and `read_model`, and `core.audit_log` has a `host.sentiment` row with `cost_tokens > 0`.
6. Fill the `## Model in use` section of ADR 0019 (English and Spanish): the model id, the eval pass count, the date, and the provider's data policy as the user states it.

- [ ] **Step 6: Commit and report**

```bash
git add apps/docs
git commit -m "docs: record the Sentiment model and its eval in ADR 0019

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Report exactly which of steps 1 to 5 ran and which did not (for example "no Resend key was available, so the live email was not sent"). Do not claim a check that was not run. Leave the commits unpushed.
