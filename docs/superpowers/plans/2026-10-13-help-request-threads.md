# Help Request Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A help request becomes a conversation: the client's owner and the agency answer in turn, either side can close it, a new message reopens it, and either side can attach a survey response or an external review.

**Architecture:** One new table of messages hangs off `reputation.survey_requests`. New use cases (`application/help.ts`) post messages, close requests, resolve attachments and notify the other side. The API gains thread routes and drops `/handle`. One shared React component (`HelpThread`) serves Manager and Platform. Pure rules live in `domain/help.ts`; Zod input shapes live in `@atrium/contracts` (the domain may not import zod).

**Tech Stack:** Bun, TypeScript, Zod 4, Drizzle, Postgres with RLS, Hono, React 19 + Base UI, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-13-help-request-threads-design.md`

## Prerequisites

- Work in the git worktree `/Users/ventura/Desktop/d/atrium/atrium.integration`, on branch `feat/help-threads` (already created from `integration/sentiment-ui`; the spec is its first commit).
- Postgres is running on `localhost:5432` (`docker ps` shows `atriumsentiment-wt-postgres-1` healthy). Do not stop, reset or recreate it. Tests run `migrate()` themselves.
- The Manager, Platform, Hub, API and worker dev servers are running from this worktree and hot-reload; do not start or stop them.
- A local untracked symlink `node_modules/drizzle-orm` exists; leave it.
- `bun run typecheck` must stay at 0 errors (it is at 0 on this branch); `bun run check:deps`, `bunx biome check .` and the tests named in each task must pass.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage only the files named in the task; never `git add -A`.
- Lessons from earlier work: Bun's `admin.unsafe(...)` is a lazy thenable (wrap in an async function inside `expect(...).rejects`); `packages/ui` tests are run from `packages/ui` (`cd packages/ui && bun test`) because the DOM preload is picked up there.

## Global Constraints

- Statuses stay `open | fulfilled | dismissed` (UI words: Waiting, Solved, Declined). Message `side` is `client` or `agency`, derived on the server from the caller's role: `can(role, "survey", "manage")` → `agency`; else `can(role, "survey", "request")` → `client`; else forbidden. It is never read from the request body.
- Roles: `client_owner` writes and may close only as `fulfilled`; `agency_admin` and `account_manager` write and may close as `fulfilled` or `dismissed`; `agency_staff` (has `forms`) reads only; `client_staff` has no access. Reading a thread follows `listSurveyRequests` (roles with `forms` or `request`).
- A message body is 1 to 2000 characters. One attachment per message. A message always has a body.
- Attachment shapes: `{ kind: "response", responseId }` and `{ kind: "review", url (https, at most 2048), rating? (1 to 5), text? (at most 1000) }`.
- A survey-response attachment resolves to rating, comment, best-part and improve options, the agent's labels (sentiment, topics, concern, safety), date and location name. It never returns contact details or the guest id.
- Notifications on a new message or a close go to `alertRecipients(tx, clientId)` except the author, kind `reputation.help_message`; the notification body carries at most the first 140 characters of the message text.
- A new message in a `fulfilled` or `dismissed` request sets it back to `open` and clears `handled_at` and `handled_by`.
- Errors: forbidden role 403; not found or not visible 404; invalid input 422; closing a request that is not open 409 `invalid_state` (the existing mapping of `SurveyStateError`).
- Pasted review text and message bodies render as plain text only. Links use `target="_blank" rel="noopener noreferrer"`.
- The removed route `POST /surveys/requests/:id/handle` must answer 404 afterwards.
- ADR 0018 is untouched: nothing here changes who is asked for a review.

## Review Focus

1. A message, or a close, in a request of another client must be invisible and refused (404), even with a valid id (Task 3 test, Task 4 test).
2. A survey-response attachment from another client, from a location the author cannot see, or with a malformed id is rejected and nothing is stored (Task 3 test).
3. The same close sent twice, or a close racing a message: the second close gets 409 and no duplicate audit or notification (Task 3 test).
4. A pasted review whose text contains HTML or `<script>`, or a `javascript:` link, is never rendered as markup or as a clickable non-https link (Task 1 contract test, Task 5 UI test).
5. A failed send or close shows an error banner; the draft text is not lost (Task 5 UI test).
6. The migration's backfill keeps every existing request readable as a thread, including requests with no note and requests with a response (Task 1 test).

## File Structure

| File | Responsibility |
|---|---|
| `modules/reputation/migrations/0008_help_threads.sql` (create) | Table, columns, RLS, grants, idempotent backfill. |
| `modules/reputation/infra/schema.ts` (modify) | Drizzle table and the new `survey_requests` columns. |
| `packages/contracts/src/help.ts`, `index.ts`, `help.test.ts` (create/modify) | Zod shapes: attachment, message, close, request. |
| `modules/reputation/domain/help.ts` (create) | Pure rules: who may close as what, whose turn, preview. |
| `modules/reputation/application/help.ts` (create) | `getThread`, `postMessage`, `closeRequest`, `listPickableResponses`. |
| `modules/reputation/application/admin.ts` (modify) | `createSurveyRequest` writes the first message; `listSurveyRequests` returns thread fields; `handleSurveyRequest` removed. |
| `modules/reputation/index.ts` (modify) | Exports. |
| `apps/api/src/surveys-admin.ts` (modify) | Thread routes; `/handle` removed. |
| `packages/ui/src/api.ts` (modify) | Types and client functions. |
| `packages/ui/src/help-thread.tsx` (create) | The shared thread view, list and composer. |
| `packages/ui/src/surveys-app.tsx`, `index.ts`, `shell/notifications.tsx` (modify) | Pages use `HelpThread`; "Ask for help about this"; notification link. |
| Tests: `modules/reputation/tests/help-domain.test.ts`, `help.test.ts`; `apps/api/tests/help-threads.test.ts`; `packages/ui/tests/help-thread.test.tsx` | |
| Docs: `apps/docs/docs/modules/reputation.md` and its es twin | |

---

### Task 1: Contracts, migration and schema

**Files:**
- Create: `packages/contracts/src/help.ts`, `packages/contracts/src/help.test.ts`, `modules/reputation/migrations/0008_help_threads.sql`, `modules/reputation/tests/help-migration.test.ts`
- Modify: `packages/contracts/src/index.ts`, `modules/reputation/infra/schema.ts`

**Interfaces:**
- Produces (contracts): `HELP_BODY_MAX = 2000`, `HelpAttachment` (zod discriminated union, type `HelpAttachment`), `HelpMessageInput` `{ body, attachment? }`, `HelpCloseInput` `{ to: "fulfilled" | "dismissed", message? }`, `HelpRequestInput` `{ locationId, note, attachment? }`.
- Produces (schema): `surveyRequestMessages` Drizzle table (`id, requestId, clientId, authorId, authorName, side, body, attachment (jsonb), createdAt`); `surveyRequests.lastMessageAt`, `.lastAuthorSide`, `.lastPreview`.

- [ ] **Step 1: Write the failing contract test**

```ts
// packages/contracts/src/help.test.ts
import { describe, expect, test } from "bun:test";
import { HelpAttachment, HelpCloseInput, HelpMessageInput, HelpRequestInput } from "./help";

const id = "7e4a0c32-9f5d-4b88-8c43-1b2c3d4e5f66";

describe("help attachments", () => {
  test("accepts a response id and an https review", () => {
    expect(HelpAttachment.safeParse({ kind: "response", responseId: id }).success).toBe(true);
    expect(
      HelpAttachment.safeParse({
        kind: "review",
        url: "https://maps.google.com/?cid=1",
        rating: 1,
        text: "Awful <script>alert(1)</script>",
      }).success,
    ).toBe(true);
  });

  test("rejects a non-https link, a javascript link and an over-long url", () => {
    for (const url of [
      "http://example.com/r",
      "javascript:alert(1)",
      "ftp://x.test/r",
      "not a url",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      expect(HelpAttachment.safeParse({ kind: "review", url }).success).toBe(false);
    }
  });

  test("rejects a bad rating, long text, extra keys and a malformed response id", () => {
    const url = "https://example.com/r";
    expect(HelpAttachment.safeParse({ kind: "review", url, rating: 6 }).success).toBe(false);
    expect(HelpAttachment.safeParse({ kind: "review", url, text: "x".repeat(1001) }).success).toBe(
      false,
    );
    expect(HelpAttachment.safeParse({ kind: "review", url, extra: 1 }).success).toBe(false);
    expect(HelpAttachment.safeParse({ kind: "response", responseId: "nope" }).success).toBe(false);
    expect(HelpAttachment.safeParse({ kind: "file", url }).success).toBe(false);
  });
});

describe("help inputs", () => {
  test("a message needs a non-empty body of at most 2000 characters", () => {
    expect(HelpMessageInput.safeParse({ body: "Hello" }).success).toBe(true);
    expect(HelpMessageInput.safeParse({ body: "   " }).success).toBe(false);
    expect(HelpMessageInput.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
    expect(HelpMessageInput.safeParse({ body: "Hi", extra: true }).success).toBe(false);
  });

  test("a close is fulfilled or dismissed with an optional message", () => {
    expect(HelpCloseInput.safeParse({ to: "fulfilled" }).success).toBe(true);
    expect(HelpCloseInput.safeParse({ to: "dismissed", message: "Not possible" }).success).toBe(
      true,
    );
    expect(HelpCloseInput.safeParse({ to: "open" }).success).toBe(false);
  });

  test("a new request needs a place and a note", () => {
    expect(HelpRequestInput.safeParse({ locationId: id, note: "Please help" }).success).toBe(true);
    expect(HelpRequestInput.safeParse({ locationId: id, note: "" }).success).toBe(false);
    expect(HelpRequestInput.safeParse({ locationId: "x", note: "Hi" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/contracts/src/help.test.ts`
Expected: FAIL, cannot find module `./help`.

- [ ] **Step 3: Implement the contracts**

```ts
// packages/contracts/src/help.ts
import { z } from "zod";

/**
 * What can travel in a help conversation. Docs: modules / Reputation (Help requests).
 * The shapes are shared by the API and the screens; the server checks everything again.
 */
export const HELP_BODY_MAX = 2000;

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const HelpAttachment = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("response"), responseId: z.string().uuid() }),
  z.strictObject({
    kind: z.literal("review"),
    url: z.string().max(2048).refine(isHttps, "must be an https link"),
    rating: z.number().int().min(1).max(5).optional(),
    text: z.string().trim().max(1000).optional(),
  }),
]);
export type HelpAttachment = z.infer<typeof HelpAttachment>;

const body = z.string().trim().min(1).max(HELP_BODY_MAX);

export const HelpMessageInput = z.strictObject({
  body,
  attachment: HelpAttachment.nullish(),
});
export type HelpMessageInput = z.infer<typeof HelpMessageInput>;

export const HelpCloseInput = z.strictObject({
  to: z.enum(["fulfilled", "dismissed"]),
  message: z.string().trim().max(HELP_BODY_MAX).nullish(),
});
export type HelpCloseInput = z.infer<typeof HelpCloseInput>;

export const HelpRequestInput = z.strictObject({
  locationId: z.string().uuid(),
  note: body,
  attachment: HelpAttachment.nullish(),
});
export type HelpRequestInput = z.infer<typeof HelpRequestInput>;
```

Add `export * from "./help";` to `packages/contracts/src/index.ts` (keep the list alphabetical: after `./events`).

- [ ] **Step 4: Run the contract test**

Run: `bun test packages/contracts`
Expected: PASS.

- [ ] **Step 5: Write the migration**

```sql
-- Reputation · a help request is a conversation. Docs: modules / Reputation (Help requests).
-- Messages belong to a request and to its client; the pair is a composite foreign key, so a
-- message can never sit under another client's request.
alter table reputation.survey_requests
  add constraint survey_requests_id_client_key unique (id, client_id),
  add column last_message_at timestamptz,
  add column last_author_side text check (last_author_side in ('client', 'agency')),
  add column last_preview text;

create table reputation.survey_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  client_id uuid not null,
  author_id text not null,
  author_name text not null,
  side text not null check (side in ('client', 'agency')),
  body text not null check (char_length(body) between 1 and 2000),
  attachment jsonb check (
    attachment is null
    or (jsonb_typeof(attachment) = 'object' and attachment ->> 'kind' in ('response', 'review'))
  ),
  created_at timestamptz not null default now(),
  foreign key (request_id, client_id)
    references reputation.survey_requests (id, client_id) on delete cascade
);
create index survey_request_messages_thread_idx
  on reputation.survey_request_messages (request_id, created_at);

alter table reputation.survey_request_messages enable row level security;
alter table reputation.survey_request_messages force row level security;
create policy survey_request_messages_scope on reputation.survey_request_messages
  using (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id())
  with check (core.is_agency() or core.is_assigned(client_id) or client_id = core.current_client_id());
grant select, insert on reputation.survey_request_messages to atrium_app;

-- backfill: every request that has no messages yet becomes a thread. Idempotent.
insert into reputation.survey_request_messages
  (request_id, client_id, author_id, author_name, side, body, created_at)
select r.id, r.client_id, r.requested_by, r.requested_by_name, 'client',
       coalesce(nullif(btrim(r.note), ''), '(no message)'), r.created_at
  from reputation.survey_requests r
 where not exists (select 1 from reputation.survey_request_messages m where m.request_id = r.id);

insert into reputation.survey_request_messages
  (request_id, client_id, author_id, author_name, side, body, created_at)
select r.id, r.client_id, coalesce(r.handled_by, 'atrium'), 'Atrium team', 'agency',
       btrim(r.response), coalesce(r.handled_at, r.created_at + interval '1 second')
  from reputation.survey_requests r
 where nullif(btrim(r.response), '') is not null
   and not exists (
     select 1 from reputation.survey_request_messages m
      where m.request_id = r.id and m.side = 'agency'
   );

update reputation.survey_requests r
   set last_message_at = m.created_at,
       last_author_side = m.side,
       last_preview = left(m.body, 140)
  from (
    select distinct on (request_id) request_id, created_at, side, body
      from reputation.survey_request_messages
     order by request_id, created_at desc
  ) m
 where m.request_id = r.id and r.last_message_at is null;
```

- [ ] **Step 6: Add the Drizzle columns and table.** In `modules/reputation/infra/schema.ts` add `jsonb` to the `drizzle-orm/pg-core` import list, then change `surveyRequests` to add after `response`:

```ts
  lastMessageAt: at("last_message_at"),
  lastAuthorSide: text("last_author_side"),
  lastPreview: text("last_preview"),
```

and append:

```ts
/** One message in a help conversation. Never updated or deleted. */
export const surveyRequestMessages = reputation.table("survey_request_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull(),
  clientId: uuid("client_id").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  side: text("side").notNull(),
  body: text("body").notNull(),
  attachment: jsonb("attachment"),
  createdAt: at("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 7: Write the failing migration test**

```ts
// modules/reputation/tests/help-migration.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `hm-admin-${suffix}` } as const;

let clientA = "";
let clientB = "";
let locA = "";

const insertRequest = async (cols: {
  note: string | null;
  response?: string | null;
  handledBy?: string | null;
}) => {
  const [row] = (await admin.unsafe(
    `insert into reputation.survey_requests
       (client_id, location_id, requested_by, requested_by_name, note, status, handled_by, handled_at, response)
     values ($1, $2, $3, 'Olivia Owner', $4, $5, $6, $7, $8) returning id`,
    [
      clientA,
      locA,
      `hm-owner-${suffix}`,
      cols.note,
      cols.response ? "fulfilled" : "open",
      cols.response ? (cols.handledBy ?? "hm-am") : null,
      cols.response ? new Date("2026-10-06T18:00:00Z") : null,
      cols.response ?? null,
    ],
  )) as { id: string }[];
  return row?.id as string;
};

const messages = async (requestId: string) =>
  (await admin.unsafe(
    "select side, body, author_name from reputation.survey_request_messages where request_id = $1 order by created_at, side",
    [requestId],
  )) as { side: string; body: string; author_name: string }[];

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-hm-${suffix}` });
    clientA = (await createClientWithOrganization(tx, { name: "Casa Olivo", slug: `hm-a-${suffix}` }))
      .client.id;
    clientB = (await createClientWithOrganization(tx, { name: "Brasa Norte", slug: `hm-b-${suffix}` }))
      .client.id;
    locA = (await createLocation(tx, clientA, { name: "Bellaire", timeZone: "America/Chicago" })).id;
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`hm-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("0008 constraints", () => {
  test("a message under another client's request is refused", async () => {
    const requestId = await insertRequest({ note: "Hello" });
    await expect(
      (async () =>
        admin.unsafe(
          `insert into reputation.survey_request_messages
             (request_id, client_id, author_id, author_name, side, body)
           values ($1, $2, 'x', 'X', 'client', 'hi')`,
          [requestId, clientB],
        ))(),
    ).rejects.toThrow();
  });

  test("side, body length and attachment kind are checked", async () => {
    const requestId = await insertRequest({ note: "Hello" });
    const insert = (side: string, body: string, attachment: string | null) =>
      (async () =>
        admin.unsafe(
          `insert into reputation.survey_request_messages
             (request_id, client_id, author_id, author_name, side, body, attachment)
           values ($1, $2, 'x', 'X', $3, $4, $5::jsonb)`,
          [requestId, clientA, side, body, attachment],
        ))();
    await expect(insert("robot", "hi", null)).rejects.toThrow();
    await expect(insert("client", "", null)).rejects.toThrow();
    await expect(insert("client", "x".repeat(2001), null)).rejects.toThrow();
    await expect(insert("client", "hi", JSON.stringify({ kind: "file" }))).rejects.toThrow();
    await insert("client", "hi", JSON.stringify({ kind: "review", url: "https://x.test/r" }));
  });
});

describe("0008 backfill", () => {
  const backfill = readFileSync(
    join(import.meta.dir, "../migrations/0008_help_threads.sql"),
    "utf8",
  ).split("-- backfill:")[1] as string;

  test("a request with a note and a response becomes two ordered messages", async () => {
    const id = await insertRequest({ note: "Change our Google link", response: "Done, check it." });
    await admin.unsafe(backfill);
    expect(await messages(id)).toEqual([
      { side: "client", body: "Change our Google link", author_name: "Olivia Owner" },
      { side: "agency", body: "Done, check it.", author_name: "Atrium team" },
    ]);
    const [r] = (await admin.unsafe(
      "select last_author_side, last_preview from reputation.survey_requests where id = $1",
      [id],
    )) as { last_author_side: string; last_preview: string }[];
    expect(r).toEqual({ last_author_side: "agency", last_preview: "Done, check it." });
  });

  test("a request with no note gets a placeholder first message, and re-running adds nothing", async () => {
    const id = await insertRequest({ note: null });
    await admin.unsafe(backfill);
    await admin.unsafe(backfill);
    expect(await messages(id)).toEqual([
      { side: "client", body: "(no message)", author_name: "Olivia Owner" },
    ]);
  });
});
```

- [ ] **Step 8: Apply, then run the tests**

Run: `bun run db:migrate` (expect `reputation/0008_help_threads.sql` applied), then `bun test modules/reputation/tests/help-migration.test.ts packages/contracts` and `bun run typecheck`.
Expected: PASS; typecheck 0 errors.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/help.ts packages/contracts/src/help.test.ts packages/contracts/src/index.ts modules/reputation/migrations/0008_help_threads.sql modules/reputation/infra/schema.ts modules/reputation/tests/help-migration.test.ts
git commit -m "feat(reputation): messages table and contracts for help threads

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Domain rules

**Files:**
- Create: `modules/reputation/domain/help.ts`, `modules/reputation/tests/help-domain.test.ts`

**Interfaces:**
- Produces: `type HelpSide = "client" | "agency"`, `type RequestStatus = "open" | "fulfilled" | "dismissed"`, `canCloseAs(side: HelpSide, to: "fulfilled" | "dismissed"): boolean`, `awaitingSide(status: RequestStatus, lastAuthorSide: HelpSide | null): HelpSide | null`, `preview(text: string, max?: number): string`, `PREVIEW_MAX = 140`.

- [ ] **Step 1: Write the failing test**

```ts
// modules/reputation/tests/help-domain.test.ts
import { describe, expect, test } from "bun:test";
import { awaitingSide, canCloseAs, PREVIEW_MAX, preview } from "../domain/help";

describe("who may close as what", () => {
  test("the client may only mark it solved; the agency may also decline", () => {
    expect(canCloseAs("client", "fulfilled")).toBe(true);
    expect(canCloseAs("client", "dismissed")).toBe(false);
    expect(canCloseAs("agency", "fulfilled")).toBe(true);
    expect(canCloseAs("agency", "dismissed")).toBe(true);
  });
});

describe("whose turn it is", () => {
  test("an open request waits for the side that did not write last", () => {
    expect(awaitingSide("open", "client")).toBe("agency");
    expect(awaitingSide("open", "agency")).toBe("client");
  });
  test("a request nobody has answered yet waits for the agency", () => {
    expect(awaitingSide("open", null)).toBe("agency");
  });
  test("a closed request waits for nobody", () => {
    expect(awaitingSide("fulfilled", "agency")).toBeNull();
    expect(awaitingSide("dismissed", "client")).toBeNull();
  });
});

describe("preview", () => {
  test("keeps short text, collapses whitespace, cuts long text with an ellipsis", () => {
    expect(preview("Hello   there\nfriend")).toBe("Hello there friend");
    const long = "x".repeat(300);
    const cut = preview(long);
    expect(cut.length).toBe(PREVIEW_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(preview("x".repeat(PREVIEW_MAX))).toBe("x".repeat(PREVIEW_MAX));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test modules/reputation/tests/help-domain.test.ts`
Expected: FAIL, cannot find `../domain/help`.

- [ ] **Step 3: Implement**

```ts
// modules/reputation/domain/help.ts
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
```

- [ ] **Step 4: Run, lint and check boundaries**

Run: `bun test modules/reputation/tests/help-domain.test.ts && bun run check:deps && bunx biome check modules/reputation/domain modules/reputation/tests/help-domain.test.ts`
Expected: PASS, no dependency violations (the file imports nothing).

- [ ] **Step 5: Commit**

```bash
git add modules/reputation/domain/help.ts modules/reputation/tests/help-domain.test.ts
git commit -m "feat(reputation): domain rules for help threads

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Use cases

**Files:**
- Create: `modules/reputation/application/help.ts`, `modules/reputation/tests/help.test.ts`
- Modify: `modules/reputation/application/admin.ts` (`SurveyRequestRow`, `listSurveyRequests`, `createSurveyRequest`, remove `handleSurveyRequest`), `modules/reputation/index.ts`

**Interfaces:**
- Consumes: `HelpAttachment`, `HelpMessageInput`, `HelpCloseInput` (Task 1); `canCloseAs`, `awaitingSide`, `preview`, `HelpSide`, `RequestStatus` (Task 2); `surveyRequestMessages`, `surveyRequests.last*` (Task 1); `SurveyForbiddenError`, `SurveyNotFoundError`, `SurveyStateError` and `assertCan` (existing, `admin.ts`).
- Produces (all exported from `modules/reputation/index.ts`):
  - `SurveyRequestRow` gains `lastMessageAt: Date | null`, `lastAuthorSide: HelpSide | null`, `lastPreview: string | null`, `awaiting: HelpSide | null`.
  - `class HelpAttachmentError extends Error` (maps to 422).
  - `type ResponseCard = { id: string; locationName: string; rating: number; comment: string | null; bestPart: string | null; improve: string | null; sentiment: string | null; topics: string[]; concern: string | null; safety: boolean | null; createdAt: Date }`
  - `type ThreadAttachment = { kind: "response"; response: ResponseCard | null } | { kind: "review"; url: string; rating: number | null; text: string | null }` (`response: null` when the response is no longer visible).
  - `type ThreadMessage = { id: string; authorName: string; side: HelpSide; body: string; attachment: ThreadAttachment | null; createdAt: Date }`
  - `type Thread = { request: SurveyRequestRow; messages: ThreadMessage[] }`
  - `getThread(tx, scope, requestId): Promise<Thread>`
  - `postMessage(tx, scope, userName, requestId, input: { body: string; attachment?: HelpAttachment | null }, deps?): Promise<ThreadMessage>`
  - `closeRequest(tx, scope, userName, requestId, to: "fulfilled" | "dismissed", message: string | null, deps?): Promise<void>`
  - `listPickableResponses(tx, scope, filter?: { locationId?: string }): Promise<{ id: string; createdAt: Date; rating: number; excerpt: string; locationName: string }[]>`
  - `createSurveyRequest(tx, scope, userName, input: { locationId: string; note: string; attachment?: HelpAttachment | null }, deps?)` (note is now required).

- [ ] **Step 1: Write the failing test.** Create `modules/reputation/tests/help.test.ts`. Its harness follows `modules/reputation/tests/flow.test.ts` (agency org, two clients, users with members, `assignClient` for the account manager) and `sentiment.test.ts` (`submitSurvey` through the QR source to create real responses). Use these exact cases:

```ts
// modules/reputation/tests/help.test.ts  (imports and harness shown; keep names)
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type AtriumEvent, SurveySubmission } from "@atrium/contracts";
import {
  assignClient,
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  type Scope,
  setPackage,
  withAgency,
  withScope,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  closeRequest,
  createSurveyRequest,
  getThread,
  HelpAttachmentError,
  listPickableResponses,
  listSurveyRequests,
  postMessage,
  submitSurvey,
  SurveyForbiddenError,
  SurveyNotFoundError,
  SurveyStateError,
  updateLocationSettings,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `help-admin-${suffix}` } as const;
const NOW = new Date("2026-10-06T17:00:00Z");
const events: AtriumEvent[] = [];
const deps = { now: () => NOW, publish: async (e: AtriumEvent) => void events.push(e) };

let a = "";
let b = "";
let locA = "";
let locA2 = "";
let locB = "";
const ids = { ownerA: "", ownerB: "", am: "", staff: "", agencyAdmin: "" };
let device = 0;

const ownerA = (): Scope => ({ kind: "client", userId: ids.ownerA, role: "client_owner", clientId: a });
const ownerB = (): Scope => ({ kind: "client", userId: ids.ownerB, role: "client_owner", clientId: b });
const am = (): Scope => ({ kind: "assigned", userId: ids.am, role: "account_manager" });
const staff = (): Scope => ({ kind: "assigned", userId: ids.staff, role: "agency_staff" });
const agencyAdmin = (): Scope => ({ kind: "agency", userId: ids.agencyAdmin, role: "agency_admin" });
const clientStaff = (): Scope => ({
  kind: "client", userId: `help-cstaff-${suffix}`, role: "client_staff", clientId: a, locationIds: [locA],
});
const as = <T>(scope: Scope, fn: Parameters<typeof withScope<T>>[2]) => withScope(db, scope, fn);

const respond = async (clientId: string, locationId: string, overrides: Record<string, unknown>) =>
  (
    await submitSurvey(
      db,
      { kind: "qr", clientId, locationId, deviceHash: `dev-help-${suffix}-${device++}` },
      SurveySubmission.parse({ rating: 2, ...overrides }),
      deps,
    )
  ).responseId;

const open = async (note = "I need help with my Google link") =>
  as(ownerA(), (tx) => createSurveyRequest(tx, ownerA(), "Olivia Owner", { locationId: locA, note }, deps));

const notesTo = async (userId: string) =>
  (await admin.unsafe(
    "select subject, body from core.notifications where kind = 'reputation.help_message' and recipient_id = $1 order by created_at",
    [userId],
  )) as { subject: string; body: string }[];

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let orgA = "";
  let orgB = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-help-${suffix}` })).id;
    const ca = await createClientWithOrganization(tx, { name: "Casa Olivo", slug: `help-a-${suffix}` });
    const cb = await createClientWithOrganization(tx, { name: "Brasa Norte", slug: `help-b-${suffix}` });
    a = ca.client.id; b = cb.client.id; orgA = ca.organization.id; orgB = cb.organization.id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
    locA2 = (await createLocation(tx, a, { name: "Heights", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, b, { name: "Norte", timeZone: "America/Chicago" })).id;
    await setPackage(tx, a, "pillar_3", actor);
    await setPackage(tx, b, "pillar_3", actor);
    for (const [c, l] of [[a, locA], [a, locA2], [b, locB]] as const) {
      await updateLocationSettings(tx, c, l, { reviewUrl: "https://g.page/r/test/review", requestDelayMinutes: 60 }, actor);
    }
  });
  ids.ownerA = `help-ownerA-${suffix}`; ids.ownerB = `help-ownerB-${suffix}`;
  ids.am = `help-am-${suffix}`; ids.staff = `help-staff-${suffix}`; ids.agencyAdmin = `help-admin2-${suffix}`;
  for (const [id, org, role] of [
    [ids.ownerA, orgA, "client_owner"], [ids.ownerB, orgB, "client_owner"],
    [ids.am, agencyOrg, "account_manager"], [ids.staff, agencyOrg, "agency_staff"],
    [ids.agencyAdmin, agencyOrg, "agency_admin"],
  ] as const) {
    await admin.unsafe("insert into core.users (id, name, email) values ($1, $1, $2)", [id, `${id}@team.test`]);
    await admin.unsafe("insert into core.members (id, organization_id, user_id, role) values ($1, $2, $3, $4)", [crypto.randomUUID(), org, id, role]);
  }
  await withAgency(db, (tx) => assignClient(tx, ids.am, a, actor));
  await withAgency(db, (tx) => assignClient(tx, ids.staff, a, actor));
});

afterAll(async () => {
  await withAgency(db, (tx) => tx.execute(sql`delete from core.clients where slug like ${`help-%-${suffix}`}`));
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.unsafe("delete from core.users where id like $1", [`help-%-${suffix}`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`help-%-${suffix}`]);
  await admin.close();
  await close();
});
```

Then the tests (each in its own `test`, same file; assertions are the contract):

```ts
describe("opening and reading a thread", () => {
  test("a new request is a thread with the owner's note as the first message, and tells the agency", async () => {
    const id = await open("Please change our link");
    const thread = await as(am(), (tx) => getThread(tx, am(), id));
    expect(thread.messages.map((m) => [m.side, m.body, m.authorName])).toEqual([["client", "Please change our link", "Olivia Owner"]]);
    expect(thread.request).toMatchObject({ status: "open", awaiting: "agency", lastAuthorSide: "client", lastPreview: "Please change our link" });
    expect((await notesTo(ids.am)).some((n) => n.body.includes("Please change our link"))).toBe(true);
    expect(await notesTo(ids.ownerA)).toEqual([]);
  });

  test("the owner can open a thread with a survey response attached", async () => {
    const responseId = await respond(a, locA, { comment: "Cold food" });
    const id = await as(ownerA(), (tx) =>
      createSurveyRequest(tx, ownerA(), "Olivia Owner", { locationId: locA, note: "What is this?", attachment: { kind: "response", responseId } }, deps),
    );
    const thread = await as(ownerA(), (tx) => getThread(tx, ownerA(), id));
    const att = thread.messages[0]?.attachment;
    expect(att).toMatchObject({ kind: "response", response: { id: responseId, comment: "Cold food", rating: 2, locationName: "Bellaire" } });
  });

  test("an empty note is refused", async () => {
    await expect(as(ownerA(), (tx) => createSurveyRequest(tx, ownerA(), "O", { locationId: locA, note: "  " }, deps))).rejects.toThrow();
  });
});

describe("who can read and write", () => {
  test("staff read but cannot write or close; client staff see nothing", async () => {
    const id = await open();
    expect((await as(staff(), (tx) => getThread(tx, staff(), id))).messages.length).toBe(1);
    await expect(as(staff(), (tx) => postMessage(tx, staff(), "Sam", id, { body: "hi" }, deps))).rejects.toBeInstanceOf(SurveyForbiddenError);
    await expect(as(staff(), (tx) => closeRequest(tx, staff(), "Sam", id, "fulfilled", null, deps))).rejects.toBeInstanceOf(SurveyForbiddenError);
    await expect(as(clientStaff(), (tx) => getThread(tx, clientStaff(), id))).rejects.toBeInstanceOf(SurveyForbiddenError);
  });

  test("another client cannot see, write to or close the thread", async () => {
    const id = await open();
    await expect(as(ownerB(), (tx) => getThread(tx, ownerB(), id))).rejects.toBeInstanceOf(SurveyNotFoundError);
    await expect(as(ownerB(), (tx) => postMessage(tx, ownerB(), "Bea", id, { body: "hi" }, deps))).rejects.toBeInstanceOf(SurveyNotFoundError);
    await expect(as(ownerB(), (tx) => closeRequest(tx, ownerB(), "Bea", id, "fulfilled", null, deps))).rejects.toBeInstanceOf(SurveyNotFoundError);
    expect((await as(ownerB(), (tx) => listSurveyRequests(tx, ownerB()))).some((r) => r.id === id)).toBe(false);
  });

  test("the side comes from the role", async () => {
    const id = await open();
    const fromAm = await as(am(), (tx) => postMessage(tx, am(), "Alex", id, { body: "On it" }, deps));
    const fromOwner = await as(ownerA(), (tx) => postMessage(tx, ownerA(), "Olivia", id, { body: "Thanks" }, deps));
    expect([fromAm.side, fromOwner.side]).toEqual(["agency", "client"]);
  });
});

describe("the conversation", () => {
  test("each message notifies the other side only, with a truncated body", async () => {
    const id = await open();
    const long = `${"y".repeat(400)}`;
    await as(am(), (tx) => postMessage(tx, am(), "Alex", id, { body: long }, deps));
    const toOwner = (await notesTo(ids.ownerA)).at(-1);
    expect(toOwner?.body.length).toBeLessThanOrEqual(220);
    expect(toOwner?.body).not.toContain("y".repeat(200));
    expect((await notesTo(ids.am)).filter((n) => n.body.includes("y".repeat(20))).length).toBe(0);
    const thread = await as(ownerA(), (tx) => getThread(tx, ownerA(), id));
    expect(thread.request.awaiting).toBe("client");
  });

  test("the owner closes as solved but cannot decline; the agency can decline", async () => {
    const id = await open();
    await expect(as(ownerA(), (tx) => closeRequest(tx, ownerA(), "Olivia", id, "dismissed", null, deps))).rejects.toBeInstanceOf(SurveyForbiddenError);
    await as(ownerA(), (tx) => closeRequest(tx, ownerA(), "Olivia", id, "fulfilled", "All good now", deps));
    const closed = await as(am(), (tx) => getThread(tx, am(), id));
    expect(closed.request).toMatchObject({ status: "fulfilled", awaiting: null });
    expect(closed.messages.at(-1)).toMatchObject({ side: "client", body: "All good now" });

    const id2 = await open();
    await as(am(), (tx) => closeRequest(tx, am(), "Alex", id2, "dismissed", "We cannot do that", deps));
    expect((await as(am(), (tx) => getThread(tx, am(), id2))).request.status).toBe("dismissed");
  });

  test("a message in a closed thread reopens it", async () => {
    const id = await open();
    await as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps));
    await as(ownerA(), (tx) => postMessage(tx, ownerA(), "Olivia", id, { body: "Actually it is still wrong" }, deps));
    const t = await as(am(), (tx) => getThread(tx, am(), id));
    expect(t.request).toMatchObject({ status: "open", awaiting: "agency" });
    const [row] = (await admin.unsafe("select handled_at, handled_by from reputation.survey_requests where id = $1", [id])) as { handled_at: Date | null; handled_by: string | null }[];
    expect(row).toEqual({ handled_at: null, handled_by: null });
  });

  test("closing twice is refused and does not notify or audit twice", async () => {
    const id = await open();
    await as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps));
    const before = (await notesTo(ids.ownerA)).length;
    await expect(as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps))).rejects.toBeInstanceOf(SurveyStateError);
    expect((await notesTo(ids.ownerA)).length).toBe(before);
    const [{ n }] = (await admin.unsafe("select count(*)::int as n from core.audit_log where action = 'reputation.help_closed_fulfilled' and input->>'requestId' = $1", [id])) as { n: number }[];
    expect(n).toBe(1);
  });

  test("two agency users closing at once: exactly one wins", async () => {
    const id = await open();
    const results = await Promise.allSettled([
      as(am(), (tx) => closeRequest(tx, am(), "Alex", id, "fulfilled", null, deps)),
      as(agencyAdmin(), (tx) => closeRequest(tx, agencyAdmin(), "Ada", id, "dismissed", null, deps)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
  });
});

describe("attachments", () => {
  test("an external review is stored and returned as a card", async () => {
    const id = await open();
    const m = await as(ownerA(), (tx) => postMessage(tx, ownerA(), "Olivia", id, {
      body: "This review is unfair",
      attachment: { kind: "review", url: "https://maps.google.com/?cid=1", rating: 1, text: "<b>Awful</b> place" },
    }, deps));
    expect(m.attachment).toEqual({ kind: "review", url: "https://maps.google.com/?cid=1", rating: 1, text: "<b>Awful</b> place" });
  });

  test("a response of another client, of a hidden location, or unknown is refused and nothing is stored", async () => {
    const id = await open();
    const other = await respond(b, locB, { comment: "Not yours" });
    const mine = await respond(a, locA2, { comment: "Heights only" });
    const before = (await as(am(), (tx) => getThread(tx, am(), id))).messages.length;
    for (const responseId of [other, crypto.randomUUID()]) {
      await expect(as(ownerA(), (tx) => postMessage(tx, ownerA(), "Olivia", id, { body: "see", attachment: { kind: "response", responseId } }, deps))).rejects.toBeInstanceOf(HelpAttachmentError);
    }
    // a location-scoped owner scope that cannot see Heights
    const scoped: Scope = { kind: "client", userId: ids.ownerA, role: "client_owner", clientId: a, locationIds: [locA] };
    await expect(as(scoped, (tx) => postMessage(tx, scoped, "Olivia", id, { body: "see", attachment: { kind: "response", responseId: mine } }, deps))).rejects.toBeInstanceOf(HelpAttachmentError);
    expect((await as(am(), (tx) => getThread(tx, am(), id))).messages.length).toBe(before);
  });

  test("a response card never carries contact details or the guest id", async () => {
    const responseId = await respond(a, locA, { comment: "Call me", wantsContact: true, contactEmail: `secret-${suffix}@guest.test`, contactName: "Secret Name" });
    const id = await open();
    const m = await as(ownerA(), (tx) => postMessage(tx, ownerA(), "Olivia", id, { body: "this one", attachment: { kind: "response", responseId } }, deps));
    const json = JSON.stringify(m);
    expect(json).not.toContain("secret-");
    expect(json).not.toContain("Secret Name");
    expect(json).not.toContain("guest");
  });
});

describe("lists", () => {
  test("the request list carries the thread summary", async () => {
    const id = await open("Summary please");
    const row = (await as(am(), (tx) => listSurveyRequests(tx, am()))).find((r) => r.id === id);
    expect(row).toMatchObject({ lastAuthorSide: "client", lastPreview: "Summary please", awaiting: "agency", status: "open" });
  });

  test("pickable responses are the recent ones of visible locations, with a short excerpt", async () => {
    await respond(a, locA, { comment: "z".repeat(200) });
    const pick = await as(ownerA(), (tx) => listPickableResponses(tx, ownerA()));
    expect(pick.length).toBeGreaterThan(0);
    expect(pick.length).toBeLessThanOrEqual(20);
    expect(pick.every((p) => p.excerpt.length <= 60)).toBe(true);
    const scoped: Scope = { kind: "client", userId: ids.ownerA, role: "client_owner", clientId: a, locationIds: [locA] };
    const some = await as(scoped, (tx) => listPickableResponses(tx, scoped));
    expect(some.every((p) => p.locationName === "Bellaire")).toBe(true);
    await expect(as(clientStaff(), (tx) => listPickableResponses(tx, clientStaff()))).resolves.toBeDefined();
  });
});
```

(Note: the last `clientStaff` pickable check should read what the role may read: `client_staff` has `read` in the matrix, so it resolves; adjust only if `assertCan(scope, "read")` rejects it, and then assert the rejection instead. Report the actual behaviour.)

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test modules/reputation/tests/help.test.ts`
Expected: FAIL (the use cases are not exported).

- [ ] **Step 3: Update `admin.ts`.** (a) Extend `SurveyRequestRow` and export a mapper; (b) replace `listSurveyRequests`' mapping; (c) rewrite `createSurveyRequest`; (d) delete `handleSurveyRequest`. Add to the file's imports: `import type { HelpAttachment } from "@atrium/contracts";`, `import { awaitingSide, type HelpSide, preview, type RequestStatus } from "../domain/help";`, `surveyRequestMessages` to the schema import, and `sendToUser`, `alertRecipients` are NOT needed here (they live in `help.ts`, which `createSurveyRequest` calls: see below).

```ts
export type SurveyRequestRow = {
  id: string;
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  requestedByName: string;
  note: string | null;
  status: RequestStatus;
  createdAt: Date;
  handledAt: Date | null;
  response: string | null;
  lastMessageAt: Date | null;
  lastAuthorSide: HelpSide | null;
  lastPreview: string | null;
  awaiting: HelpSide | null;
};

export function toRequestRow(
  r: typeof surveyRequests.$inferSelect,
  labels: Map<string, { clientName: string; locationName: string }>,
): SurveyRequestRow {
  const lastAuthorSide = (r.lastAuthorSide as HelpSide | null) ?? null;
  const status = r.status as RequestStatus;
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: labels.get(r.locationId)?.clientName ?? "",
    locationId: r.locationId,
    locationName: labels.get(r.locationId)?.locationName ?? "",
    requestedByName: r.requestedByName,
    note: r.note,
    status,
    createdAt: r.createdAt,
    handledAt: r.handledAt,
    response: r.response,
    lastMessageAt: r.lastMessageAt,
    lastAuthorSide,
    lastPreview: r.lastPreview,
    awaiting: awaitingSide(status, lastAuthorSide),
  };
}
```

`listSurveyRequests` keeps its role check and query but orders by `desc(coalesce(lastMessageAt, createdAt))` (use `sql\`coalesce(${surveyRequests.lastMessageAt}, ${surveyRequests.createdAt}) desc\``) and returns `rows.map((r) => toRequestRow(r, labels))`.

`createSurveyRequest` (replace body; keep the signature shape, `note` required, attachment optional):

```ts
export async function createSurveyRequest(
  tx: Tx,
  scope: Scope,
  userName: string,
  input: { locationId: string; note: string; attachment?: HelpAttachment | null },
  deps: ReputationDeps = {},
) {
  assertCan(scope, "request");
  const note = input.note.trim();
  if (!note) throw new Error("the request needs a message");
  const label = (await describeLocations(tx, [input.locationId])).get(input.locationId);
  if (!label) throw new SurveyNotFoundError("location not found");
  const now = clock(deps);
  const [row] = await tx
    .insert(surveyRequests)
    .values({
      clientId: label.clientId,
      locationId: input.locationId,
      requestedBy: scope.userId,
      requestedByName: userName,
      note,
      createdAt: now,
      lastMessageAt: now,
      lastAuthorSide: "client",
      lastPreview: preview(note),
    })
    .returning({ id: surveyRequests.id });
  if (!row) throw new Error("request was not stored");
  const request = { id: row.id, clientId: label.clientId, locationId: input.locationId };
  const attachment = await checkAttachment(tx, scope, request.clientId, input.attachment ?? null);
  await tx.insert(surveyRequestMessages).values({
    requestId: row.id,
    clientId: label.clientId,
    authorId: scope.userId,
    authorName: userName,
    side: "client",
    body: note,
    attachment,
    createdAt: now,
  });
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: label.clientId,
    locationId: input.locationId,
    action: "reputation.request_survey",
    decision: "executed",
    reason: preview(note),
  });
  await notifyOthers(tx, scope, request, label.locationName, note, "New help request", deps);
  return row.id;
}
```

Import `checkAttachment` and `notifyOthers` from `./help` (they are exported from there for this purpose, see Step 4) and make `help.ts` import `assertCan`-free helpers from `admin.ts` only through `SurveyForbiddenError`, `SurveyNotFoundError`, `SurveyStateError`, `toRequestRow`, `actorOf`, `assertCan` — these must be exported from `admin.ts` (add `export` to `actorOf` and `assertCan`). To avoid a circular import, put `checkAttachment` and `notifyOthers` in a third file `modules/reputation/application/help-shared.ts` that imports only from `../infra/schema`, `../domain/help`, `./shared` and `@atrium/*`, and have both `admin.ts` and `help.ts` import from it. `help-shared.ts` throws `HelpAttachmentError` (defined there; re-exported from `help.ts` and the index).

Delete `handleSurveyRequest` and its export from `index.ts` (the API route using it is replaced in Task 4).

- [ ] **Step 4: Write `help-shared.ts` and `help.ts`.**

```ts
// modules/reputation/application/help-shared.ts
import type { HelpAttachment } from "@atrium/contracts";
import { alertRecipients, locationVisible, type Scope, sendToUser, type Tx } from "@atrium/core";
import { and, eq } from "drizzle-orm";
import { preview } from "../domain/help";
import { surveyResponses } from "../infra/schema";
import type { ReputationDeps } from "./shared";

export class HelpAttachmentError extends Error {}

/**
 * Validates an attachment against what the author may see and returns what is stored. A response
 * is stored by id only; it must belong to the request's client and to a location the author can see.
 * A review was already shape-checked by the contract, so it is stored as given.
 */
export async function checkAttachment(
  tx: Tx,
  scope: Scope,
  clientId: string,
  attachment: HelpAttachment | null,
): Promise<HelpAttachment | null> {
  if (!attachment) return null;
  if (attachment.kind === "review") return attachment;
  const [row] = await tx
    .select({ id: surveyResponses.id, locationId: surveyResponses.locationId })
    .from(surveyResponses)
    .where(and(eq(surveyResponses.id, attachment.responseId), eq(surveyResponses.clientId, clientId)));
  if (!row || !locationVisible(scope, row.locationId)) {
    throw new HelpAttachmentError("that response is not available");
  }
  return { kind: "response", responseId: row.id };
}

/** Tells everyone who handles this client except the author. The body carries a short preview only. */
export async function notifyOthers(
  tx: Tx,
  scope: Scope,
  request: { id: string; clientId: string },
  locationName: string,
  text: string,
  subject: string,
  deps: ReputationDeps = {},
): Promise<number> {
  let sent = 0;
  for (const recipient of await alertRecipients(tx, request.clientId)) {
    if (recipient.userId === scope.userId) continue;
    const result = await sendToUser(
      tx,
      {
        clientId: request.clientId,
        userId: recipient.userId,
        kind: "reputation.help_message",
        subject: `${subject} · ${locationName}`,
        body: preview(text),
      },
      deps.transport,
    );
    if (result.sent) sent += 1;
  }
  return sent;
}
```

```ts
// modules/reputation/application/help.ts
import type { HelpAttachment } from "@atrium/contracts";
import { can, describeLocations, locationVisible, type Scope, type Tx, writeAudit } from "@atrium/core";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { canCloseAs, type HelpSide, preview } from "../domain/help";
import { surveyRequestMessages, surveyRequests, surveyResponses } from "../infra/schema";
import {
  actorOf,
  assertCan,
  SurveyForbiddenError,
  SurveyNotFoundError,
  type SurveyRequestRow,
  SurveyStateError,
  toRequestRow,
} from "./admin";
import { checkAttachment, HelpAttachmentError, notifyOthers } from "./help-shared";
import { clock, type ReputationDeps } from "./shared";

export { HelpAttachmentError };

export type ResponseCard = {
  id: string;
  locationName: string;
  rating: number;
  comment: string | null;
  bestPart: string | null;
  improve: string | null;
  sentiment: string | null;
  topics: string[];
  concern: string | null;
  safety: boolean | null;
  createdAt: Date;
};
export type ThreadAttachment =
  | { kind: "response"; response: ResponseCard | null }
  | { kind: "review"; url: string; rating: number | null; text: string | null };
export type ThreadMessage = {
  id: string;
  authorName: string;
  side: HelpSide;
  body: string;
  attachment: ThreadAttachment | null;
  createdAt: Date;
};
export type Thread = { request: SurveyRequestRow; messages: ThreadMessage[] };

/** Agency roles write for the agency; a client owner writes for the client; nobody else writes. */
function sideOf(scope: Scope): HelpSide {
  if (can(scope.role, "survey", "manage")) return "agency";
  if (can(scope.role, "survey", "request")) return "client";
  throw new SurveyForbiddenError(`role ${scope.role} cannot write in help requests`);
}

function assertCanRead(scope: Scope) {
  if (!can(scope.role, "survey", "forms") && !can(scope.role, "survey", "request")) {
    throw new SurveyForbiddenError(`role ${scope.role} cannot see help requests`);
  }
}

async function loadRequest(tx: Tx, requestId: string) {
  const [request] = await tx.select().from(surveyRequests).where(eq(surveyRequests.id, requestId));
  if (!request) throw new SurveyNotFoundError("request not found");
  return request;
}

async function resolveMessages(
  tx: Tx,
  rows: (typeof surveyRequestMessages.$inferSelect)[],
): Promise<ThreadMessage[]> {
  const responseIds = rows.flatMap((m) => {
    const a = m.attachment as HelpAttachment | null;
    return a?.kind === "response" ? [a.responseId] : [];
  });
  const responses = responseIds.length
    ? await tx.select().from(surveyResponses).where(inArray(surveyResponses.id, responseIds))
    : [];
  const labels = await describeLocations(tx, [...new Set(responses.map((r) => r.locationId))]);
  const cards = new Map<string, ResponseCard>(
    responses.map((r) => [
      r.id,
      {
        id: r.id,
        locationName: labels.get(r.locationId)?.locationName ?? "",
        rating: r.rating,
        comment: r.comment,
        bestPart: r.bestPart,
        improve: r.improve,
        sentiment: r.sentiment,
        topics: r.topics ?? [],
        concern: r.concern,
        safety: r.safety,
        createdAt: r.createdAt,
      },
    ]),
  );
  return rows.map((m) => {
    const a = m.attachment as HelpAttachment | null;
    const attachment: ThreadAttachment | null = !a
      ? null
      : a.kind === "response"
        ? { kind: "response", response: cards.get(a.responseId) ?? null }
        : { kind: "review", url: a.url, rating: a.rating ?? null, text: a.text ?? null };
    return {
      id: m.id,
      authorName: m.authorName,
      side: m.side as HelpSide,
      body: m.body,
      attachment,
      createdAt: m.createdAt,
    };
  });
}

export async function getThread(tx: Tx, scope: Scope, requestId: string): Promise<Thread> {
  assertCanRead(scope);
  const request = await loadRequest(tx, requestId);
  const labels = await describeLocations(tx, [request.locationId]);
  const rows = await tx
    .select()
    .from(surveyRequestMessages)
    .where(eq(surveyRequestMessages.requestId, requestId))
    .orderBy(asc(surveyRequestMessages.createdAt), asc(surveyRequestMessages.side));
  return { request: toRequestRow(request, labels), messages: await resolveMessages(tx, rows) };
}

export async function postMessage(
  tx: Tx,
  scope: Scope,
  userName: string,
  requestId: string,
  input: { body: string; attachment?: HelpAttachment | null },
  deps: ReputationDeps = {},
): Promise<ThreadMessage> {
  const side = sideOf(scope);
  const request = await loadRequest(tx, requestId);
  const body = input.body.trim();
  if (!body) throw new Error("the message is empty");
  const attachment = await checkAttachment(tx, scope, request.clientId, input.attachment ?? null);
  const now = clock(deps);
  const [row] = await tx
    .insert(surveyRequestMessages)
    .values({
      requestId,
      clientId: request.clientId,
      authorId: scope.userId,
      authorName: userName,
      side,
      body,
      attachment,
      createdAt: now,
    })
    .returning();
  if (!row) throw new Error("message was not stored");
  const reopened = request.status !== "open";
  await tx
    .update(surveyRequests)
    .set({
      lastMessageAt: now,
      lastAuthorSide: side,
      lastPreview: preview(body),
      ...(reopened ? { status: "open", handledAt: null, handledBy: null } : {}),
    })
    .where(eq(surveyRequests.id, requestId));
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: request.clientId,
    locationId: request.locationId,
    action: "reputation.help_message_posted",
    input: { requestId, side, attached: attachment?.kind ?? null, reopened },
    decision: "executed",
  });
  const label = (await describeLocations(tx, [request.locationId])).get(request.locationId);
  await notifyOthers(tx, scope, request, label?.locationName ?? "a place", body, "New message", deps);
  return (await resolveMessages(tx, [row]))[0] as ThreadMessage;
}

export async function closeRequest(
  tx: Tx,
  scope: Scope,
  userName: string,
  requestId: string,
  to: "fulfilled" | "dismissed",
  message: string | null,
  deps: ReputationDeps = {},
): Promise<void> {
  const side = sideOf(scope);
  if (!canCloseAs(side, to)) {
    throw new SurveyForbiddenError(`the ${side} cannot close a request as ${to}`);
  }
  const request = await loadRequest(tx, requestId);
  const now = clock(deps);
  const closing = message?.trim() || null;
  // One winner when two people close at once: only an open request is updated.
  const closed = await tx
    .update(surveyRequests)
    .set({
      status: to,
      handledAt: now,
      handledBy: scope.userId,
      ...(closing ? { response: closing, lastMessageAt: now, lastAuthorSide: side, lastPreview: preview(closing) } : {}),
    })
    .where(and(eq(surveyRequests.id, requestId), eq(surveyRequests.status, "open")))
    .returning({ id: surveyRequests.id });
  if (closed.length === 0) {
    throw new SurveyStateError(`the request is already ${request.status === "open" ? "closed" : request.status}`);
  }
  if (closing) {
    await tx.insert(surveyRequestMessages).values({
      requestId,
      clientId: request.clientId,
      authorId: scope.userId,
      authorName: userName,
      side,
      body: closing,
      attachment: null,
      createdAt: now,
    });
  }
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: request.clientId,
    locationId: request.locationId,
    action: `reputation.help_closed_${to}`,
    input: { requestId },
    decision: "executed",
    reason: closing,
  });
  const label = (await describeLocations(tx, [request.locationId])).get(request.locationId);
  await notifyOthers(
    tx,
    scope,
    request,
    label?.locationName ?? "a place",
    closing ?? (to === "fulfilled" ? "Marked as solved." : "Declined."),
    to === "fulfilled" ? "Request solved" : "Request declined",
    deps,
  );
}

export async function listPickableResponses(
  tx: Tx,
  scope: Scope,
  filter: { locationId?: string } = {},
): Promise<{ id: string; createdAt: Date; rating: number; excerpt: string; locationName: string }[]> {
  assertCan(scope, "read");
  const rows = await tx
    .select()
    .from(surveyResponses)
    .where(filter.locationId ? eq(surveyResponses.locationId, filter.locationId) : undefined)
    .orderBy(desc(surveyResponses.createdAt))
    .limit(60);
  const visible = rows.filter((r) => locationVisible(scope, r.locationId)).slice(0, 20);
  const labels = await describeLocations(tx, [...new Set(visible.map((r) => r.locationId))]);
  return visible.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    rating: r.rating,
    excerpt: preview(r.comment ?? "(no comment)", 60),
    locationName: labels.get(r.locationId)?.locationName ?? "",
  }));
}
```

(`ne` import in `help.ts` is unused; remove it. In `admin.ts`, add `export` to `actorOf` and `assertCan`.) Export from `modules/reputation/index.ts`: `closeRequest, getThread, HelpAttachmentError, listPickableResponses, postMessage` plus the types `ResponseCard, Thread, ThreadAttachment, ThreadMessage`, and remove `handleSurveyRequest`.

- [ ] **Step 5: Run the tests**

Run: `bun test modules/reputation && bun run typecheck && bun run check:deps && bunx biome check modules/reputation`
Expected: PASS, including the existing `flow.test.ts`, `sentiment.test.ts` and `location-scope.test.ts`. Fix call sites that still use `handleSurveyRequest` or the old `createSurveyRequest` shape only in this task's files; `apps/api/src/surveys-admin.ts` is rewritten in Task 4 and may fail typecheck until then — in that case do Task 4's route edits in this commit's working tree only as far as needed for `bun run typecheck` to pass, or run typecheck after Task 4. State which you did.

- [ ] **Step 6: Commit**

```bash
git add modules/reputation/application/help.ts modules/reputation/application/help-shared.ts modules/reputation/application/admin.ts modules/reputation/index.ts modules/reputation/tests/help.test.ts
git commit -m "feat(reputation): help conversations: post, close, attach, notify

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API routes

**Files:**
- Modify: `apps/api/src/surveys-admin.ts`
- Create: `apps/api/tests/help-threads.test.ts`

**Interfaces:**
- Consumes: `getThread`, `postMessage`, `closeRequest`, `listPickableResponses`, `createSurveyRequest`, `listSurveyRequests`, `HelpAttachmentError` (Task 3); `HelpMessageInput`, `HelpCloseInput`, `HelpRequestInput` (Task 1).
- Produces: `GET /surveys/requests` (rows with `lastMessageAt, lastAuthorSide, lastPreview, awaiting`), `POST /surveys/requests` body `{ locationId, note, attachment? }` → 201 `{ id }`, `GET /surveys/requests/:id` → `{ request, messages }`, `POST /surveys/requests/:id/messages` body `{ body, attachment? }` → 201 `{ message }`, `POST /surveys/requests/:id/close` body `{ to, message? }` → `{ ok: true }`, `GET /surveys/responses/pickable?locationId=` → `{ responses }`. `POST /surveys/requests/:id/handle` is gone (404).

- [ ] **Step 1: Write the failing API test.** Follow the harness at the top of `apps/api/tests/surveys-admin.test.ts` (`createApp`, `createAuth`, `userWith`, `call`). Create `apps/api/tests/help-threads.test.ts` with its own suffix (`help-api`), users `owner` (client_owner of client A), `am` (account_manager assigned to A), `staff` (agency_staff assigned to A), `otherOwner` (client_owner of client B), one location per client, and these tests:

```ts
test("the owner opens a request and the agency replies, in order", async () => {
  const created = await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "Help with my QR" });
  expect(created.status).toBe(201);
  const { id } = await created.json();
  const reply = await call("am", "POST", `/api/surveys/requests/${id}/messages`, { body: "On it" });
  expect(reply.status).toBe(201);
  const thread = await (await call("owner", "GET", `/api/surveys/requests/${id}`)).json();
  expect(thread.messages.map((m: any) => [m.side, m.body])).toEqual([["client", "Help with my QR"], ["agency", "On it"]]);
  expect(thread.request).toMatchObject({ status: "open", awaiting: "client" });
});

test("validation: an empty note, an http review link and an over-long body are 422", async () => {
  expect((await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: " " })).status).toBe(422);
  const { id } = await (await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })).json();
  expect((await call("owner", "POST", `/api/surveys/requests/${id}/messages`, { body: "see", attachment: { kind: "review", url: "http://insecure.test/r" } })).status).toBe(422);
  expect((await call("owner", "POST", `/api/surveys/requests/${id}/messages`, { body: "x".repeat(2001) })).status).toBe(422);
  expect((await call("owner", "POST", `/api/surveys/requests/${id}/messages`, { body: "hi", side: "agency" })).status).toBe(422);
});

test("role gates: staff read only, other client sees 404, owner cannot decline", async () => {
  const { id } = await (await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })).json();
  expect((await call("staff", "GET", `/api/surveys/requests/${id}`)).status).toBe(200);
  expect((await call("staff", "POST", `/api/surveys/requests/${id}/messages`, { body: "hi" })).status).toBe(403);
  expect((await call("otherOwner", "GET", `/api/surveys/requests/${id}`)).status).toBe(404);
  expect((await call("otherOwner", "POST", `/api/surveys/requests/${id}/messages`, { body: "hi" })).status).toBe(404);
  expect((await call("owner", "POST", `/api/surveys/requests/${id}/close`, { to: "dismissed" })).status).toBe(403);
});

test("closing: solved by the owner, twice is 409, a message reopens, the agency can decline", async () => {
  const { id } = await (await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })).json();
  expect((await call("owner", "POST", `/api/surveys/requests/${id}/close`, { to: "fulfilled", message: "Solved" })).status).toBe(200);
  expect((await call("owner", "POST", `/api/surveys/requests/${id}/close`, { to: "fulfilled" })).status).toBe(409);
  expect((await call("am", "POST", `/api/surveys/requests/${id}/messages`, { body: "One more thing" })).status).toBe(201);
  expect((await (await call("am", "GET", `/api/surveys/requests/${id}`)).json()).request.status).toBe("open");
  expect((await call("am", "POST", `/api/surveys/requests/${id}/close`, { to: "dismissed" })).status).toBe(200);
});

test("a response attachment resolves in the thread; another client's response is 422", async () => {
  const answer = (clientId: string, locationId: string, n: number, extra: object) =>
    submitSurvey(
      db,
      { kind: "qr", clientId, locationId, deviceHash: `dev-helpapi-${suffix}-${n}` },
      SurveySubmission.parse({ rating: 2, comment: "Cold food", ...extra }),
      { now: () => NOW },
    ).then((r) => r.responseId);
  const mine = await answer(clientA, locA, 1, {
    wantsContact: true,
    contactEmail: `secret-${suffix}@guest.test`,
    contactName: "Secret Name",
  });
  const theirs = await answer(clientB, locB, 2, {});

  const created = await call("owner", "POST", "/api/surveys/requests", {
    locationId: locA,
    note: "See this one",
    attachment: { kind: "response", responseId: mine },
  });
  expect(created.status).toBe(201);
  const { id } = await created.json();
  const thread = await (await call("am", "GET", `/api/surveys/requests/${id}`)).json();
  expect(thread.messages[0].attachment.response).toMatchObject({
    id: mine,
    rating: 2,
    comment: "Cold food",
    locationName: "Bellaire",
  });
  expect(JSON.stringify(thread)).not.toContain("secret-");
  expect(JSON.stringify(thread)).not.toContain("Secret Name");

  const bad = await call("owner", "POST", `/api/surveys/requests/${id}/messages`, {
    body: "and this",
    attachment: { kind: "response", responseId: theirs },
  });
  expect(bad.status).toBe(422);
});

test("the old /handle route is gone", async () => {
  const { id } = await (await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })).json();
  expect((await call("am", "POST", `/api/surveys/requests/${id}/handle`, { to: "fulfilled" })).status).toBe(404);
});

test("pickable responses are limited to the caller's client", async () => {
  const mine = await (await call("owner", "GET", "/api/surveys/responses/pickable")).json();
  expect(Array.isArray(mine.responses)).toBe(true);
  expect((await call("otherOwner", "GET", "/api/surveys/responses/pickable")).status).toBe(200);
});
```

Fill in the response-attachment test with real responses created by calling `submitSurvey` from `@atrium/reputation` directly with a `qr` source (as `sentiment.test.ts` does), so the attachment test is real. Note: if a role gate returns a different status than listed (for example 404 where 403 is shown), assert what the use case really does and say so; the contract is "forbidden role 403, not visible 404".

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test apps/api/tests/help-threads.test.ts`
Expected: FAIL (routes missing).

- [ ] **Step 3: Implement the routes.** In `surveys-admin.ts`: import `closeRequest, getThread, HelpAttachmentError, listPickableResponses, postMessage` from `@atrium/reputation` and `HelpCloseInput, HelpMessageInput, HelpRequestInput` from `@atrium/contracts`; drop `handleSurveyRequest`. In `guard`, add before the generic `throw`:

```ts
      if (error instanceof HelpAttachmentError) {
        return c.json({ error: "attachment_not_found", message: error.message }, 422);
      }
```

Replace the existing `POST /surveys/requests` and delete `POST /surveys/requests/:id/handle`; add the new routes:

```ts
  api.post("/surveys/requests", (c) =>
    guard(c, async () => {
      const parsed = HelpRequestInput.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
      const id = await withScope(deps.db, c.get("scope"), (tx) =>
        createSurveyRequest(tx, c.get("scope"), c.get("userName"), parsed.data, options),
      );
      return c.json({ id }, 201);
    }),
  );

  api.get("/surveys/requests/:id", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const thread = await withScope(deps.db, c.get("scope"), (tx) =>
        getThread(tx, c.get("scope"), id),
      );
      return c.json(thread);
    }),
  );

  api.post("/surveys/requests/:id/messages", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const parsed = HelpMessageInput.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
      const message = await withScope(deps.db, c.get("scope"), (tx) =>
        postMessage(tx, c.get("scope"), c.get("userName"), id, parsed.data, options),
      );
      return c.json({ message }, 201);
    }),
  );

  api.post("/surveys/requests/:id/close", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const parsed = HelpCloseInput.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
      await withScope(deps.db, c.get("scope"), (tx) =>
        closeRequest(tx, c.get("scope"), c.get("userName"), id, parsed.data.to, parsed.data.message ?? null, options),
      );
      return c.json({ ok: true });
    }),
  );

  api.get("/surveys/responses/pickable", (c) =>
    guard(c, async () => {
      const locationId = c.req.query("locationId");
      if (locationId !== undefined && !UUID.test(locationId)) {
        return c.json({ error: "invalid_request" }, 422);
      }
      const responses = await withScope(deps.db, c.get("scope"), (tx) =>
        listPickableResponses(tx, c.get("scope"), locationId ? { locationId } : {}),
      );
      return c.json({ responses });
    }),
  );
```

Register `GET /surveys/responses/pickable` BEFORE any `/surveys/responses/:something` route if one exists (Hono matches in order). Update the file's doc comment: the client owner can now ask for help and take part in the conversation.

- [ ] **Step 4: Run**

Run: `bun test apps/api && bun run typecheck && bun run check:deps && bunx biome check apps/api`
Expected: PASS (other `apps/api/tests` that used `/handle` or the old note-optional request must be updated in this task to the new contract; list them in the report).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/surveys-admin.ts apps/api/tests/help-threads.test.ts apps/api/tests
git commit -m "feat(api): help thread routes; the one-shot handle route is gone

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Stage only the test files you actually changed under `apps/api/tests`, not the directory.)

---

### Task 5: The shared `HelpThread` component and the UI client

**Files:**
- Modify: `packages/ui/src/api.ts`
- Create: `packages/ui/src/help-thread.tsx`, `packages/ui/tests/help-thread.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: the API of Task 4.
- Produces: in `api.ts` — types `HelpAttachmentInput` (same shape as the contract's `HelpAttachment`), `ThreadMessage`, `ThreadRequest` (a `SurveyRequest` with `lastMessageAt`, `lastAuthorSide`, `lastPreview`, `awaiting`), `HelpThreadData = { request: ThreadRequest; messages: ThreadMessage[] }`, `PickableResponse`; client functions `api.surveyRequests()` (updated type), `api.requestSurvey(locationId, note, attachment?)`, `api.helpThread(id)`, `api.postHelpMessage(id, body, attachment?)`, `api.closeHelpRequest(id, to, message?)`, `api.pickableResponses(locationId?)`; remove `api.handleSurveyRequest`. In `help-thread.tsx` — `HelpThreads({ canDecline, canWrite?, pollMs?, initialSelected? })`, exported from the package index.

- [ ] **Step 1: Write the failing UI tests** in `packages/ui/tests/help-thread.test.tsx`, using `setup`, `screen`, `fakeFetch`, `ownerMe`/`amMe` and `MeProvider` (read `packages/ui/tests/helpers.tsx` and `surveys-app.test.tsx`/`pages.test.tsx` for how pages are wrapped with a `Me`). Cases (each is a `test`; fetch is faked by path; for POST routes `fakeFetch` answers by exact path regardless of method, so also record `calls` and assert the body):

1. Renders the list with "Waiting for you" on a request whose `awaiting` is the viewer's side, and opens the thread on click: both messages visible, the agency's labelled and aligned differently (assert the visible author side labels "Atrium team" / "You").
2. A response attachment renders as a card: rating, comment, location; a review attachment renders a link with `href` equal to the url, `target="_blank"`, `rel` containing `noopener` and `noreferrer`, and the pasted text.
3. A review whose `text` is `<script>alert(1)</script><b>x</b>` renders as literal text (`getByText` finds the angle-bracket string) and `container.querySelector("script")` is null.
4. Sending: typing in the composer and clicking Send POSTs `{ body }` to `/api/surveys/requests/<id>/messages`, clears the textarea on success and reloads the thread.
5. A failed send (fake returns 500 for that path via a function route that throws? use a custom fetch override returning `Response("{}", { status: 500 })`) shows a visible error banner (`role="alert"` or text "could not send") and KEEPS the typed text.
6. The owner (`canDecline` false) sees "Mark as solved" but not "Decline"; the agency sees both. Clicking "Decline" POSTs `{ to: "dismissed" }` to `/close`; a failed close shows a banner.
7. A closed request shows "Solved"/"Declined" status and the composer is still present; sending a message calls the messages route.
8. Attach menu: choosing "External review" shows URL/text/stars fields; an `http://` URL shows a validation message and does not POST; an `https://` URL posts `{ body, attachment: { kind: "review", url, ... } }`. Choosing "Survey response" lists `pickableResponses` items (excerpt and rating) and posting sends `{ kind: "response", responseId }`.
9. Polling: with fake timers or an injectable interval prop (`pollMs`, default 15000), advancing time re-fetches the open thread; the poll pauses when `document.visibilityState` is `hidden`.

Concrete pattern for cases 1, 3, 5 and 6 (write the others in the same style). `fakeFetch` answers by path and ignores the method, so a failing POST uses a custom `globalThis.fetch` wrapper that returns `new Response("{}", { status: 500 })` for the POST path and delegates the rest:

```tsx
import { afterEach, describe, expect, test } from "bun:test";
import { HelpThreads } from "../src/help-thread";
import { MeProvider } from "../src/shell/me-context";
import { amMe, fakeFetch, ownerMe, restoreFetch } from "./fake-api";
import { screen, setup, waitFor, within } from "./helpers";

afterEach(restoreFetch);

const ID = "11111111-1111-4111-8111-111111111111";
const base = (over: Record<string, unknown> = {}) => ({
  id: ID, clientName: "Casa Olivo", locationName: "Bellaire", requestedByName: "Olivia Owner",
  note: "Help", status: "open", createdAt: new Date().toISOString(), handledAt: null, response: null,
  lastMessageAt: new Date().toISOString(), lastAuthorSide: "client", lastPreview: "Help", awaiting: "agency",
  ...over,
});
const msg = (id: string, side: "client" | "agency", body: string, attachment: unknown = null) => ({
  id, side, body, attachment, authorName: side === "client" ? "Olivia Owner" : "Alex Manager",
  createdAt: new Date().toISOString(),
});
const routes = (request = base(), messages = [msg("m1", "client", "Help")]) => ({
  "/api/surveys/requests": { requests: [request] },
  [`/api/surveys/requests/${ID}`]: { request, messages },
});
const asOwner = (ui: React.ReactNode) => setup(<MeProvider me={ownerMe}>{ui}</MeProvider>);
const asAm = (ui: React.ReactNode) => setup(<MeProvider me={amMe}>{ui}</MeProvider>);

describe("HelpThreads", () => {
  test("the agency sees whose turn it is and opens the conversation", async () => {
    fakeFetch(routes(base(), [msg("m1", "client", "Help"), msg("m2", "agency", "On it")]));
    const { user } = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    const list = await screen.findByRole("list", { name: "Help requests" });
    expect(within(list).getByText(/waiting for atrium/i)).toBeTruthy();
    await user.click(within(list).getByText("Bellaire"));
    const convo = await screen.findByRole("region", { name: "Conversation" });
    expect(within(convo).getByText("Help")).toBeTruthy();
    expect(within(convo).getByText("On it")).toBeTruthy();
  });

  test("pasted review text and links are inert", async () => {
    const review = { kind: "review", url: "https://maps.google.com/?cid=1", rating: 1, text: "<script>alert(1)</script><b>x</b>" };
    const { container, user } = (fakeFetch(routes(base(), [msg("m1", "client", "Unfair", review)])),
      asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />));
    await user.click(await screen.findByText("Bellaire"));
    expect(await screen.findByText("<script>alert(1)</script><b>x</b>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    const link = screen.getByRole("link", { name: /maps\.google\.com/i });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  test("a failed send shows a banner and keeps the draft", async () => {
    const real = fakeFetch(routes());
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/messages") && init?.method === "POST"
        ? new Response("{}", { status: 500 })
        : inner(input, init)) as typeof fetch;
    const { user } = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await user.click(await screen.findByText("Bellaire"));
    const box = (await screen.findByLabelText("Message")) as HTMLTextAreaElement;
    await user.type(box, "Still broken");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/could not send/i)).toBeTruthy();
    expect(box.value).toBe("Still broken");
    expect(real.some((c) => c.path.endsWith("/messages"))).toBe(false); // the wrapper answered it
  });

  test("the owner can mark it solved but not decline; the agency can do both", async () => {
    fakeFetch(routes());
    const owner = asOwner(<HelpThreads canDecline={false} canWrite pollMs={60_000} />);
    await owner.user.click(await screen.findByText("Bellaire"));
    expect(await screen.findByRole("button", { name: "Mark as solved" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
    owner.unmount();
    fakeFetch(routes());
    const am = asAm(<HelpThreads canDecline canWrite pollMs={60_000} />);
    await am.user.click(await screen.findByText("Bellaire"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy());
  });
});
```

Add `canWrite?: boolean` (default true) to `HelpThreads` (hides the composer and the close buttons for `agency_staff`). Expected assertions must use real roles/labels from the component you write; keep stable accessible names: list `aria-label="Help requests"`, thread region `aria-label="Conversation"`, composer textarea label "Message", buttons "Send", "Mark as solved", "Decline", "Attach", menu items "External review" and "Survey response".

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/ui && bun test tests/help-thread.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Update `api.ts`.** Replace the `SurveyRequest` type with:

```ts
export type HelpAttachmentInput =
  | { kind: "response"; responseId: string }
  | { kind: "review"; url: string; rating?: number; text?: string };

export type ThreadAttachment =
  | {
      kind: "response";
      response: {
        id: string;
        locationName: string;
        rating: number;
        comment: string | null;
        bestPart: string | null;
        improve: string | null;
        sentiment: string | null;
        topics: string[];
        concern: string | null;
        safety: boolean | null;
        createdAt: string;
      } | null;
    }
  | { kind: "review"; url: string; rating: number | null; text: string | null };

export type ThreadMessage = {
  id: string;
  authorName: string;
  side: "client" | "agency";
  body: string;
  attachment: ThreadAttachment | null;
  createdAt: string;
};

export type SurveyRequest = {
  id: string;
  clientName: string;
  locationName: string;
  requestedByName: string;
  note: string | null;
  status: "open" | "fulfilled" | "dismissed";
  createdAt: string;
  handledAt: string | null;
  response: string | null;
  lastMessageAt: string | null;
  lastAuthorSide: "client" | "agency" | null;
  lastPreview: string | null;
  awaiting: "client" | "agency" | null;
};

export type HelpThreadData = { request: SurveyRequest; messages: ThreadMessage[] };
export type PickableResponse = {
  id: string;
  createdAt: string;
  rating: number;
  excerpt: string;
  locationName: string;
};
```

and replace `requestSurvey` and `handleSurveyRequest` in `api` with:

```ts
  requestSurvey: (locationId: string, note: string, attachment?: HelpAttachmentInput) =>
    call<{ id: string }>("/api/surveys/requests", {
      method: "POST",
      body: JSON.stringify({ locationId, note: note.trim(), ...(attachment ? { attachment } : {}) }),
    }),
  helpThread: (id: string) => call<HelpThreadData>(`/api/surveys/requests/${id}`),
  postHelpMessage: (id: string, body: string, attachment?: HelpAttachmentInput) =>
    call<unknown>(`/api/surveys/requests/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: body.trim(), ...(attachment ? { attachment } : {}) }),
    }),
  closeHelpRequest: (id: string, to: "fulfilled" | "dismissed", message?: string) =>
    call<unknown>(`/api/surveys/requests/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ to, ...(message?.trim() ? { message: message.trim() } : {}) }),
    }),
  pickableResponses: (locationId?: string) =>
    call<{ responses: PickableResponse[] }>(
      `/api/surveys/responses/pickable${locationId ? `?locationId=${locationId}` : ""}`,
    ).then((r) => r.responses),
```

- [ ] **Step 4: Implement `help-thread.tsx`.** One file, `"use client"`. Build it from the primitives already used in `surveys-app.tsx` (import paths as in that file: `./actions/button`, `./data/card`, `./data/misc` (`Skeleton`), `./feedback/badge` (`StatusBadge`), `./feedback/banner`, `./feedback/states`, `./format` (`ago`), `./forms/input` (`TextareaField`, `TextField`), `./forms/select`, `./layout/list-panel` (`ListPanel`, `ROW_PAD`), `./shell/me-context` (`useMe`)). Structure:

```tsx
export function HelpThreads({
  canDecline,
  canWrite = true,
  pollMs = 15_000,
  initialSelected = null,
}: { canDecline: boolean; canWrite?: boolean; pollMs?: number; initialSelected?: string | null }) { ... }
```

- State: `requests` (loaded with `api.surveyRequests`, reloaded on the poll), `selected` id, `thread` (loaded with `api.helpThread`, reloaded on the poll), `error`.
- Layout: `grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]` like Cases: `ListPanel aria-label="Help requests"` on the left, the conversation on the right (`lg:sticky lg:top-6`).
- List row: status badge (`Waiting`/`Solved`/`Declined` via the existing `StatusBadge` mapping), location (and client name when `me.kind !== "client"`), the `lastPreview`, `ago(lastMessageAt ?? createdAt)`, and a turn label: `awaiting === viewerSide ? "Waiting for you" : awaiting ? "Waiting for the other side"` where `viewerSide = me.kind === "client" ? "client" : "agency"` (use "Waiting for the client" / "Waiting for Atrium" for clarity). Sort by `lastMessageAt ?? createdAt` descending (the API already does).
- Thread (`<section aria-label="Conversation">`): a header with location, requester and status; messages in a list; each message shows `authorName`, the side label (`You` when the side equals the viewer's, else `Atrium team` or `The client`), `ago(createdAt)`, the body as a plain text node (`whitespace-pre-wrap`), and its attachment card. Align own messages to the end and the other side's to the start, with a visible side label so colour is not the only cue.
- Attachment cards: `response` → rating (`n/5` text, not stars), comment, best/improve option, labels (sentiment, topics, concern, "Safety concern" when `safety`), date and location; `response: null` → "This response is no longer available". `review` → an external link (`<a href={url} target="_blank" rel="noopener noreferrer">`) showing the hostname, optional `rating/5`, optional pasted text as plain text. Links render only when `url` starts with `https://`.
- Composer: `TextareaField label="Message"` (maxLength 2000, rows 3), an `Attach` button that opens a small menu with "External review" and "Survey response", the chosen attachment shown as a removable chip; Send disabled while empty or busy; buttons from `canDecline`: "Mark as solved" (always, when the request is open) and "Decline" (only `canDecline`, when open). Closing sends the composer text, when present, as the closing message. After a successful send or close: clear the draft and attachment, reload thread and list. On failure: show `<Banner status="danger">` with "We could not send that. Try again." (close: "We could not close it. Try again."), keep the draft and the attachment. Never `.catch(() => undefined)`.
- External review form: URL (`TextField`, required, validated client-side with `new URL(v).protocol === "https:"`; invalid → inline error "Use the https link of the review." and no request), optional text (`TextareaField`, 1000), optional rating 1-5 (`Select`).
- Survey response picker: loads `api.pickableResponses()` when opened; a `ListPanel` of choices ("<date> · <rating>/5 · <excerpt>"), selecting one sets the attachment.
- Polling: a `useEffect` interval of `pollMs` that, only when `document.visibilityState === "visible"`, reloads the list and the open thread; also reload on `window` `focus`. Clean up on unmount.
- Empty and error states: `EmptyState "No help requests"` when the list is empty (with a different line for the client: "Ask for help from the Help page"), `ErrorState` with retry when the list fails.

Export `HelpThreads` from `packages/ui/src/index.ts` next to `HelpPage`/`HelpRequestsPage`.

- [ ] **Step 5: Run**

Run: `cd packages/ui && bun test && cd ../.. && bun run typecheck && bunx biome check packages/ui`
Expected: all PASS (the new file's tests, plus the existing UI tests; update `surveys-app.test.tsx` only where it referenced `RequestRow`/`handleSurveyRequest` — those pages are rewired in Task 6, so if the old tests fail here, finish Task 6's rewiring first and commit both together; state which you did).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/api.ts packages/ui/src/help-thread.tsx packages/ui/src/index.ts packages/ui/tests/help-thread.test.tsx
git commit -m "feat(ui): shared help conversation view

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the pages, "Ask for help about this" and the notification link

**Files:**
- Modify: `packages/ui/src/surveys-app.tsx`, `packages/ui/src/shell/notifications.tsx`
- Test: `packages/ui/tests/surveys-app.test.tsx` (extend), `packages/ui/tests/notifications.test.tsx` (extend)

**Interfaces:**
- Consumes: `HelpThreads` (Task 5), `api.requestSurvey` with attachment.
- Produces: `HelpRequestsPage` (Manager) renders `<HelpThreads canDecline />` for roles with `canManageSurveys`, read-only composer hidden for `agency_staff`; `HelpPage` (Platform) renders the "new request" card plus `<HelpThreads canDecline={false} />`; `ResponseCard` shows an "Ask for help about this" button for `me.canRequestSurveys` that navigates to the Help page with the response preselected; `notificationHref("reputation.help_message", surface)` returns `/reputation/help` for the manager and `/help` for the platform.

- [ ] **Step 1: Write the failing tests.** Extend `surveys-app.test.tsx` and `notifications.test.tsx`:
  - `notificationHref("reputation.help_message", "manager")` is `/reputation/help`; `"platform"` is `/help`.
  - `HelpRequestsPage` for an account manager renders the thread list (fake `/api/surveys/requests` and `/api/me`-driven `Me`); for `agency_staff` (`canManageSurveys` false, `canViewForms` true) the list renders but the composer and close buttons do not.
  - `HelpPage` for an owner renders the new-request form with a required "What do you need?" field; submitting an empty note shows "Write a message first." and does not POST; a valid note POSTs `{ locationId, note }` and then shows the thread list.
  - `ResponsesPage` for an owner shows "Ask for help about this" on a response; clicking it navigates (assert `window.location` or the router push the page already uses: read how other pages navigate, for example `useRouter` from `next/navigation` or plain anchors; prefer an anchor `href="/help?response=<id>"` so no router mock is needed) and `HelpPage` reads `?response=` and opens the new-request form with that response attached (an attachment chip is visible and the POST includes `attachment: { kind: "response", responseId }`). For an agency role the button is absent.

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/ui && bun test tests/surveys-app.test.tsx tests/notifications.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In `surveys-app.tsx` delete `RequestRow`, `REQUEST_STATUS`, `Requests`; `HelpRequestsPage` becomes `{me.canViewForms ? <HelpThreads canDecline={me.canManageSurveys} /> : <NotAvailable />}` (the composer and close buttons are hidden by `HelpThreads` when the viewer cannot write: pass `canWrite={me.canManageSurveys}` for the agency page and `canWrite` true for the owner; add that prop to `HelpThreads` and cover it in Task 5's component test if it is not there yet).
  - `HelpPanel` keeps the place picker and the note (the note is now required: client-side message "Write a message first."), reads `new URLSearchParams(window.location.search).get("response")` for a preselected response (shown as a removable chip, fetched via `api.pickableResponses()` only to show its excerpt, falling back to "Survey response"), submits with `api.requestSurvey(chosen, note, attachment)`, and renders `<HelpThreads canDecline={false} canWrite />` below it instead of the old "Your requests" list.
  - In `ResponseCard`, when `me.canRequestSurveys`, add `<Button size="sm" variant="outline" nativeButton={false} render={<a href={`/help?response=${r.id}`} />}>Ask for help about this</Button>` (`ResponseCard` must read `useMe()`; keep its props).
  - In `notifications.tsx` add the case `"reputation.help_message": return surface === "manager" ? "/reputation/help" : "/help";`.

- [ ] **Step 4: Run everything for the package and the apps**

Run: `cd packages/ui && bun test && cd ../.. && bun run typecheck && bun run check:deps && bunx biome check .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/surveys-app.tsx packages/ui/src/shell/notifications.tsx packages/ui/tests/surveys-app.test.tsx packages/ui/tests/notifications.test.tsx packages/ui/src/help-thread.tsx packages/ui/tests/help-thread.test.tsx
git commit -m "feat(ui): help pages as conversations, ask about a response, notification link

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs and end-to-end verification

**Files:**
- Modify: `apps/docs/docs/modules/reputation.md` and `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/modules/reputation.md`; `apps/docs/docs/architecture/events-and-contracts.md` only if the notification kind is catalogued there (grep for `reputation.case_alert`; add `reputation.help_message` in the same list, both languages).

- [ ] **Step 1: Document.** Add a section "Help requests as conversations" to both Reputation pages: what a request is now (a thread), who can write and close (the table from the spec), reopening, the two attachment kinds and what a response card shows (no contact data), the notification (`reputation.help_message`, 140-character preview), polling every 15 seconds, and the out-of-scope list. The Spanish text must match the English; follow the style of the neighbouring Spanish sections.

- [ ] **Step 2: Full verification**

Run: `bun run check:deps && bunx biome check . && bun run typecheck && bun test modules apps/api packages/contracts && (cd packages/ui && bun test) && bun test apps/worker && bun run docs:build`
Expected: all pass; `docs:build` succeeds in both languages. (The worker suites take several minutes; run them last.)

- [ ] **Step 3: Browser check against the running stack.** The Manager (`localhost:3002`) and Platform (`localhost:3003`) hot-reload from this worktree and the API at `:3001` restarts on change (`bun --watch`). After `bun run db:migrate` (already applied in Task 1) verify by hand and record what you saw: (1) as `demo-owner@demo.test`, Help → write a request with a review link attached; (2) as `demo-am@demo.test` (Manager → Help requests), reply; the owner sees the reply after at most 15 seconds without reloading; (3) the owner marks it solved; the AM replies again and the thread is Waiting again; (4) the AM declines a second request; the owner does not see a Decline button; (5) Platform → Responses → "Ask for help about this" opens Help with the response attached. Use the `claude-in-chrome` tools if you have them; otherwise describe what the controller must check and run the API-level equivalents with `curl`.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/docs/modules/reputation.md apps/docs/i18n/es/docusaurus-plugin-content-docs/current/modules/reputation.md
git commit -m "docs: help requests as conversations

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Add the events catalog files to the same commit if you changed them.)

---

## Deviations from the spec (decided while planning)

- A closed-twice request answers `409 invalid_state` (the existing `SurveyStateError` mapping), not `409 already_closed`.
- `survey_requests` also gets `last_preview` (denormalised from the newest message) so the list needs no second query.
- `survey_requests` gets a unique `(id, client_id)` so a message can reference its request with a composite foreign key and never sit under another client.
- The first message of a request is now required (the old optional note is gone); legacy requests with no note get the placeholder `(no message)`.
- Zod shapes live in `@atrium/contracts` because the domain may not import zod (`domain-is-pure`).

## Self-review notes

- **Spec coverage:** data and backfill (Task 1); roles, reopen, close rules, notifications with 140-character preview, audit (Tasks 2, 3); attachments with resolution and no contact data (Task 3); API routes and the removed `/handle` (Task 4); shared component, errors visible, polling, owner without Decline (Task 5); pages, "Ask for help about this", notification link (Task 6); docs and browser check (Task 7).
- **Out of scope, unchanged:** files, real time, unread counters, editing or deleting messages, agents reading threads, per-location thread privacy.
