# CRM Loyalty Core (delivery A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the loyalty part of the CRM module (`modules/crm`): programs per location, anonymous device-bound cards, stamps, rewards, redeem, void, optional email opt-in with consent, activity and band figures, events, rate limits, and the public and staff API routes.

**Architecture:** A new package `@atrium/crm` in the standard module shape (pure `domain/`, `application/` use cases through a `Tx`, `infra/schema.ts`, `migrations/`, `mcp/`, `tests/`, public `index.ts`). Postgres schema `crm` with row-level security copied from Reputation. Public requests find their card through `security definer` functions (`crm.card_scope`, `crm.program_scope`, `crm.hit_rate`); everything else runs through `withScope`/`withTenant`. Routes live in `apps/api/src/loyalty.ts` and are mounted like the Reputation routes. Core gains a `loyalty` permission resource and one consent source.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle (Postgres), Zod, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-19-crm-loyalty-qr-card-design.md` (sections 1, 3, 4 and "Settled during review"). Delivery B (the `qr-card` app and the Platform screens) is a separate plan.

## Global Constraints

- Branch `feat/crm-loyalty`, repo folder `/Users/ventura/Desktop/d/atrium/atrium` (no extra worktrees). One commit per task, English message, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Module boundaries (`bun run check:deps`): `modules/crm` imports only `@atrium/core`'s public API, `@atrium/contracts`, `@atrium/scoring` and itself. `domain/` imports only `domain/`, contracts and scoring.
- No personal data in `crm` tables, in events, in logs or in audit entries. Events carry ids only. An email exists only in Core's guest tables.
- Tokens: a card token is 16 random bytes in base64url; it is stored only as a sha-256 hex hash (`token_hash`, unique, `^[0-9a-f]{64}$`); the plaintext is returned once. Comparisons of secrets and signatures are constant-time.
- Short code: 8 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, unique per location, shown `XXXX-XXXX`, accepted case-insensitively with or without the dash.
- Join token: `jq1.<programId>.<join_qr_version>.<signature>`; signature = base64url HMAC-SHA256 under `LOYALTY_SECRET` over `join:<programId>:<version>`. It never verifies a survey QR token (`qr1...`) and the reverse.
- Program rules: `stamps_required` 2 to 20 (default 8), `cooldown_minutes` 0 to 1440 (default 240), `reward_label` 1 to 80 characters, `accent` one of `lime`, `clay`, `charcoal`, `sage`. One program per location in v1 (unique `location_id`).
- A card's progress is derived from `crm.loyalty_events`; nothing stores a running count. `void` cancels the latest not-yet-voided stamp and never deletes.
- Stamp and redeem are transactional, take an advisory lock on the card for the rest of the transaction, are idempotent per `(card_id, idempotency_key)` (a replay returns the first result and writes nothing), and write a `core` audit entry (`action` `crm.loyalty.stamp`, `crm.loyalty.redeem`, `crm.loyalty.void`; `decision` `executed`; actor `{ type: "user", id: userId }`; input holds ids only).
- Permissions (`loyalty: ["read", "stamp", "redeem", "manage"]`): `agency_admin` and `account_manager` read and manage; `agency_staff` read; `client_owner` all four; `client_staff` read, stamp and redeem. Only client roles stamp or redeem. A staff user's locations come from `scope.locationIds` (row-level security also enforces it).
- Access: every session route resolves the client's level with Core's `accessFor(tx, clientId)` and requires `retention` not `locked`, answering the same locked response the other routes use.
- Public routes: no session; a first-party httpOnly cookie `atr_card_dev` identifies the device (server-generated, never taken from a body); the device hash is `hashDevice`-style HMAC of that cookie. Over a limit the answer is 429 with `Retry-After`. Limits: 20 join attempts per IP per hour; 1 card per device per program per day; 200 new cards per program per hour; 120 reads per minute per card token; 10 stamp attempts per minute per staff user. The client IP is the first hop of `X-Forwarded-For` only when `TRUST_PROXY=1`, otherwise the socket address.
- A paused program, a suspended location or a closed card answers **200** with `state: "paused"` or `"closed"`. An unknown token is 404. `GET` supports `ETag` / `If-None-Match` (304).
- Environment: `LOYALTY_SECRET` (the loyalty routes are not mounted without it), `TRUST_PROXY`, `QR_CARD_URL` (used by delivery B). Add them to `.env.example` with comments.
- Tests need Postgres (`docker compose up -d postgres`, `bun run db:migrate`). The full `bun run ci` must be green before delivery A is done.

## Review Focus

1. `crm.card_scope` and `crm.program_scope` must not let anyone enumerate or probe cards: an exact full hash only; a prefix, an empty string and a wrong hash return no row; the plaintext token is never stored (Task 3).
2. Two stamps for one card at the same instant (concurrency) and the cooldown boundary (exactly `cooldown_minutes` after the last stamp is allowed; one second earlier is not) (Task 5).
3. A replayed idempotency key returns the original result with no second event, even after the card changed (Task 5).
4. Staff of location A cannot stamp, redeem or read a card of location B, and a location outside the caller's scope answers the same "not found" as an unknown code (Task 5, Task 8).
5. A survey QR token or an invitation token can never act as a join token and the reverse; a rotated `join_qr_version` rejects old tokens (Task 2, Task 4).
6. Attaching an email that already belongs to another guest leaves the card untouched and reveals nothing about the other guest (Task 6).

## File Structure

| File | Responsibility |
| --- | --- |
| `modules/core/domain/roles.ts`, `modules/core/domain/contact.ts`, new `modules/core/migrations/00NN_consent_loyalty_card.sql` (modify, create) | Permission resource and the consent source. |
| `packages/contracts/src/events.ts` (modify) | Five loyalty and capture events. |
| `modules/crm/package.json`, `index.ts` (create) | The package and its public API. |
| `modules/crm/domain/loyalty.ts`, `tokens.ts`, `rate.ts` (create) | Pure rules: progress, `canStamp`, codes, tokens, join tokens, rate decisions. |
| `modules/crm/migrations/0001_loyalty.sql` (create) | Schema, tables, row-level security, security-definer functions. |
| `modules/crm/infra/schema.ts` (create) | Drizzle tables. |
| `modules/crm/application/program.ts`, `cards.ts`, `stamps.ts`, `email.ts`, `activity.ts`, `rate.ts`, `erasure.ts`, `shared.ts` (create) | Use cases. |
| `modules/crm/mcp/tools.ts` (create) | `crm.get_loyalty_card`. |
| `apps/api/src/loyalty.ts` (create), `apps/api/src/app.ts`, `cases.ts`, `server.ts`, `apps/api/package.json` (modify) | Routes and wiring. |
| `.env.example`, docs EN/ES (modify, create) | Variables and documentation. |

---

### Task 1: Core permission, consent source, and the events

**Files:**
- Modify: `modules/core/domain/roles.ts`, `modules/core/domain/contact.ts`, `packages/contracts/src/events.ts`
- Create: `modules/core/migrations/<next number after the latest>_consent_loyalty_card.sql`
- Test: `modules/core/tests/loyalty-permissions.test.ts`, additions to `packages/contracts/src/events.test.ts` and `modules/core/tests/guests.test.ts` (or the file that tests consents)

**Interfaces:**
- Produces: `PERMISSIONS.loyalty = ["read", "stamp", "redeem", "manage"]` and the matrix grants listed in Global Constraints (`can(role, "loyalty", action)` works); `CONSENT_SOURCES` gains `"loyalty_card"` and the `consents_source_check` constraint accepts it (drop and re-add the constraint as `0014_email_only.sql` did, keeping every existing value); events (each `defineEvent`, added to `EVENT_SCHEMAS`): `loyalty.card.issued` v1 `{ cardId: uuid, programId: uuid }`, `loyalty.stamp.added` v1 `{ cardId: uuid, stampsInCycle: int >= 0, stampsRequired: int >= 2 }`, `loyalty.reward.earned` v1 `{ cardId: uuid, rewardId: uuid }`, `loyalty.reward.redeemed` v1 `{ cardId: uuid, rewardId: uuid }`, `contact.captured` v1 `{ guestId: uuid, source: "loyalty_card" }`.

- [ ] **Step 1: Write the failing tests:** `can("client_staff","loyalty","stamp")` and `"redeem"` and `"read"` are true and `"manage"` false; `can("client_owner", ..., "manage")` true; `can("account_manager","loyalty","stamp")` false and `"manage"` true; `can("agency_staff","loyalty","read")` true and `"stamp"` false; recording a consent with source `loyalty_card` succeeds through `recordConsent` and an unknown source still fails; each new event schema parses a valid sample, rejects an extra key and a missing id, and `findPersonalDataKey` finds nothing in a sample; `EVENT_TYPES` includes the five.
- [ ] **Step 2: Run to verify failure.** `cd modules/core && bun test tests/loyalty-permissions.test.ts` and `cd packages/contracts && bun test`. Expected: FAIL.
- [ ] **Step 3: Implement** the permission resource and matrix, the consent source (domain list and migration), and the five events.
- [ ] **Step 4: Run to verify pass**; `bun run db:migrate`, `bun run check:deps`, `bun run typecheck`, `bun run lint:fix`, and the `modules/core` and `packages/contracts` suites once.
- [ ] **Step 5: Commit** `feat(core): the loyalty permission, the loyalty_card consent source, and the loyalty events`.

---

### Task 2: The crm package and its pure rules

**Files:**
- Create: `modules/crm/package.json` (`@atrium/crm`, same dependencies as `@atrium/reputation`), `modules/crm/index.ts`, `modules/crm/domain/loyalty.ts`, `domain/tokens.ts`, `domain/rate.ts`; register the package in the workspace the way `modules/reputation` is (root `package.json` workspaces, `tsconfig` paths if the repo uses them)
- Test: `modules/crm/tests/domain.test.ts`

**Interfaces:**
- Produces:
  - `domain/tokens.ts`: `generateCardToken(): string` (16 random bytes, base64url, 22 chars); `hashCardToken(token: string): string` (sha-256 hex); `looksLikeCardToken(value: string): boolean`; `generateShortCode(random?: () => number): string` (8 chars from the alphabet); `formatShortCode(code: string): string` (`XXXX-XXXX`); `normalizeShortCode(input: string): string | null` (upper-cases, strips `-` and spaces, returns null unless 8 valid characters); `signJoinToken(secret: string, programId: string, version: number): string`; `verifyJoinToken(secret: string, token: string): { programId: string; version: number } | null` (constant-time; null for any other prefix, a bad signature, a non-uuid id or a non-positive version).
  - `domain/loyalty.ts`: `type LoyaltyEventKind = "stamp" | "reward_earned" | "reward_redeemed" | "void"`; `type EventRow = { kind: LoyaltyEventKind; at: Date; voidsId?: string; id: string }`; `progress(events: EventRow[], stampsRequired: number): { stampsInCycle: number; rewardsEarned: number; rewardsRedeemed: number; rewardReady: boolean }` (a `void` cancels the stamp it points to; stamps are counted since the last `reward_earned`; `reward_ready` is `rewardsEarned > rewardsRedeemed`); `canStamp(input: { programActive: boolean; locationActive: boolean; cardClosed: boolean; lastStampAt: Date | null; cooldownMinutes: number; now: Date }): { ok: true } | { ok: false; reason: "paused" | "closed" | "cooldown"; retryAt?: Date }` (exactly `cooldownMinutes` after the last stamp is allowed); `ACCENTS = ["lime","clay","charcoal","sage"] as const`.
  - `domain/rate.ts`: `LIMITS` (the numbers from Global Constraints, named), `windowStart(now: Date, windowSeconds: number): Date`, `rateAllowed(count: number, limit: number): boolean` (count already includes the current hit; allowed when `count <= limit`), `retryAfterSeconds(now: Date, windowSeconds: number): number`.
  - `index.ts` exports nothing yet beyond a placeholder comment; later tasks add exports.

- [ ] **Step 1: Write the failing tests** (names and assertions):
  - `generateCardToken` returns 22 base64url characters, two calls differ, `hashCardToken` is 64 hex and stable, `looksLikeCardToken` accepts a generated token and rejects `""`, a 21-character string and one with `+`.
  - `generateShortCode` has 8 characters all in the alphabet (run 500 times with the default random: none contains `0`, `O`, `1`, `I`, `L`); with an injected `random` returning 0 it is `"22222222"`; `formatShortCode("K7M492QD")` is `"K7M4-92QD"`; `normalizeShortCode(" k7m4-92qd ")` is `"K7M492QD"` and `normalizeShortCode("K7M4-92Q")` is `null` and `normalizeShortCode("K7M4-92Q0")` is `null`.
  - `signJoinToken("s","11111111-1111-4111-8111-111111111111",3)` verifies back to `{programId, version: 3}`; a changed signature, a changed version, another secret, the prefix `qr1` and `jq2`, a non-uuid id, version `0` and `-1` all verify to `null`; a token signed for a program never verifies as a different program (change one character of the id).
  - `progress`: 3 stamps of 8 give `stampsInCycle` 3; the 8th stamp plus a `reward_earned` gives `stampsInCycle` 0, `rewardsEarned` 1, `rewardReady` true; after `reward_redeemed` `rewardReady` false; a `void` pointing at the 3rd stamp gives 2; a void of a stamp from a finished cycle does not change the current cycle (document by test what the function does: a void whose target is before the last `reward_earned` is ignored).
  - `canStamp`: inactive program gives `paused`, inactive location `paused`, closed card `closed`, last stamp 239 minutes ago with cooldown 240 gives `cooldown` and `retryAt` one minute later, exactly 240 minutes ago is `ok`, no last stamp is `ok`, cooldown 0 is always `ok`.
  - `rate`: `windowStart` floors to the window; `rateAllowed(20, 20)` true and `(21, 20)` false; `retryAfterSeconds` is between 1 and the window.
- [ ] **Step 2: Run to verify failure.** `cd modules/crm && bun test tests/domain.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** with `node:crypto`; no other imports in `domain/`.
- [ ] **Step 4: Run to verify pass**; `bun install` if the workspace needs linking, `bun run check:deps`, `bun run typecheck`, `bun run lint:fix`.
- [ ] **Step 5: Commit** `feat(crm): the crm package with the pure loyalty rules, tokens and rate limits`.

---

### Task 3: The schema, row-level security and the security-definer functions

**Files:**
- Create: `modules/crm/migrations/0001_loyalty.sql`, `modules/crm/infra/schema.ts`
- Test: `modules/crm/tests/migration.test.ts`

**Interfaces:**
- Produces: Postgres schema `crm` (with `grant usage` to `atrium_app`) and tables `crm.loyalty_programs`, `crm.loyalty_cards`, `crm.loyalty_events`, `crm.loyalty_rewards`, `crm.rate_counters` with the columns of spec section 1, except that `loyalty_programs` has an `accent text not null default 'lime' check (accent in ('lime','clay','charcoal','sage'))` instead of the spec's `brand` jsonb (the "Settled during review" section: no logo, an accent from the closed palette) (add `client_id uuid not null` and the `foreign key (client_id, location_id) references core.locations (client_id, id) on delete cascade` to each tenant table; `loyalty_cards.short_code` unique per `(location_id, short_code)`; `loyalty_cards.token_hash` unique with the 64-hex check; `loyalty_events (card_id, idempotency_key)` unique; `loyalty_events.kind` check; `voids_id uuid` nullable referencing `loyalty_events (id)`; `loyalty_programs.location_id` unique; the program rule checks from Global Constraints; `rate_counters (key text, window_start timestamptz, count int, primary key (key, window_start))`). Row-level security on the four tenant tables mirroring Reputation: `enable` + `force`, policy `<table>_scope` `using` / `with check` as in `0001_reputation.sql` PLUS the location predicate of `0006_location_scope.sql` for every table that has `location_id`; `grant select, insert, update` to `atrium_app` (events: `select, insert` only: nothing updates an event). Functions (all `security definer set search_path = crm, pg_temp`, `revoke all ... from public`, `grant execute ... to atrium_app`): `crm.card_scope(hash text) returns table (card_id uuid, client_id uuid, location_id uuid, program_id uuid)` exact match on `token_hash = hash` only; `crm.program_scope(program uuid) returns table (client_id uuid, location_id uuid, active boolean, join_qr_version int)`; `crm.hit_rate(rate_key text, window_start timestamptz, lim int) returns boolean` (insert or increment the counter and return whether the new count is `<= lim`; also deletes counters older than one day about once in fifty calls). `infra/schema.ts` exports the Drizzle tables (`loyaltyPrograms`, `loyaltyCards`, `loyaltyEvents`, `loyaltyRewards`) in the style of `modules/reputation/infra/schema.ts`.

- [ ] **Step 1: Write the failing tests** (harness: `modules/reputation/tests/location-scope.test.ts` for creating clients, locations and scoped transactions): migration applies on an empty database; rows insert for client A and are invisible under `withTenant` for client B (every tenant table); a `client_staff` scope with `locationIds` of location A cannot see a card of location B of the same client; the agency scope sees both; an `assigned` scope sees only assigned clients; `card_scope` returns the row for the exact hash of a card and **no row** for a prefix of the hash, an empty string and a made-up 64-hex hash; `program_scope` returns the program's client; `hit_rate` returns true up to the limit and false on the next call in the same window, and a new window starts again; the event table rejects an update (permission denied as `atrium_app`); `loyalty_programs` rejects `stamps_required` 1 and 21 and `cooldown_minutes` 1441; a duplicate `(card_id, idempotency_key)` fails; deleting the location cascades.
- [ ] **Step 2: Run to verify failure.** `cd modules/crm && bun test tests/migration.test.ts` (with `set -a; . ./.env.local; set +a` from the repo root).
- [ ] **Step 3: Implement** the migration and the Drizzle schema.
- [ ] **Step 4: Run to verify pass**; run the migration twice (second run is a no-op); `bun run check:deps`, `bun run typecheck`, `bun run lint:fix`.
- [ ] **Step 5: Commit** `feat(crm): the loyalty schema with row-level security and the public lookup functions`.

---

### Task 4: Programs, joining, and the public card

**Files:**
- Create: `modules/crm/application/shared.ts`, `program.ts`, `cards.ts`, `rate.ts`
- Modify: `modules/crm/index.ts`
- Test: `modules/crm/tests/program-cards.test.ts`

**Interfaces:**
- Consumes: Task 2 domain, Task 3 schema and functions; Core's `Scope`, `Tx`, `Database`, `withTenant`, `can`, `listLocationLabels`/`locationStatusFor` and `publish` shape (`Publish` like `GuestDeps` in `modules/core/application/guests.ts`).
- Produces:
  - `type CrmDeps = { publish?: Publish; now?: () => Date; secret: string }`.
  - `type Program = { id: string; locationId: string; name: string; stampsRequired: number; rewardLabel: string; cooldownMinutes: number; active: boolean; accent: Accent; joinQrVersion: number }`.
  - `getProgram(tx: Tx, scope: Scope, locationId: string): Promise<Program | null>` (needs `loyalty:read`; out-of-scope locations give null).
  - `upsertProgram(tx: Tx, scope: Scope, locationId: string, input: { name: string; stampsRequired: number; rewardLabel: string; cooldownMinutes: number; active: boolean; accent: Accent }, deps: CrmDeps): Promise<Program>` (needs `loyalty:manage`, validates the Global Constraints ranges, `InvalidProgramError` otherwise, `LoyaltyForbiddenError` for a missing permission).
  - `rotateJoinQr(tx: Tx, scope: Scope, programId: string): Promise<Program>` (bumps `join_qr_version`; `loyalty:manage`).
  - `joinToken(program: Program, secret: string): string` (the signed `jq1` token for printing).
  - `issueCard(db: Database, input: { joinToken: string; deviceHash: string; ip: string }, deps: CrmDeps): Promise<{ ok: true; card: { token: string; shortCode: string }; programId: string } | { ok: false; reason: "invalid" | "paused" | "device_limit" | "rate_limited"; retryAfter?: number }>`: verifies the token (`verifyJoinToken`), resolves `crm.program_scope`, checks the version equals the program's `join_qr_version`, the program and location are active (`locationStatusFor`), applies the limits through `checkRate`, creates the card inside `withTenant` (retries a short-code collision up to 5 times), publishes `loyalty.card.issued`, returns the plaintext token once.
  - `getCardByToken(db: Database, token: string, deps: CrmDeps): Promise<CardView | null>` where `CardView = { state: "active" | "paused" | "closed"; locationName: string; programName: string; rewardLabel: string; accent: Accent; stampsRequired: number; stampsInCycle: number; rewardReady: boolean; shortCode: string; etag: string }` (null for an unknown token; the `etag` is a hash of the visible state).
  - `checkRate(db: Database, key: string, limitName: keyof typeof LIMITS, now: Date): Promise<{ allowed: boolean; retryAfter: number }>` (uses `crm.hit_rate`).
  - `class LoyaltyForbiddenError`, `class InvalidProgramError`.
  - `index.ts` exports all of the above plus the domain helpers other layers need (`normalizeShortCode`, `hashCardToken`, `signJoinToken`, `ACCENTS`).

- [ ] **Step 1: Write the failing tests:** `upsertProgram` creates and then updates the one program of a location; `client_staff` and `agency_staff` get `LoyaltyForbiddenError`; `stampsRequired` 1 and 21, a reward label of 81 characters and an unknown accent give `InvalidProgramError`; `rotateJoinQr` makes the previous join token fail `issueCard` with `invalid`; `issueCard` with a valid token creates a card, returns a 22-character token, stores only its hash (assert no column equals the plaintext), publishes `loyalty.card.issued` with ids only; a survey QR token (`signQrToken` from Reputation's domain: import only via the test, not the module) and an invitation token give `invalid`; a token for a paused program or a suspended location gives `paused`; the same `deviceHash` twice on one program in a day gives `device_limit`; 201 cards in an hour gives `rate_limited` with `retryAfter`; a short-code collision (inject a fixed generator) is retried and succeeds; `getCardByToken` returns the view with `stampsInCycle` 0, never a guest field, `null` for an unknown token and a one-character-off token, `state: "paused"` when the program is paused and `"closed"` when the card is closed; two reads with an unchanged card give the same `etag`.
- [ ] **Step 2: Run to verify failure.** `cd modules/crm && bun test tests/program-cards.test.ts`.
- [ ] **Step 3: Implement.** `issueCard` and `getCardByToken` run without a session, so they call the `security definer` functions on `db` first (as `resolveInvitation` does in Reputation), then `withTenant` for the work.
- [ ] **Step 4: Run to verify pass**; `bun run check:deps`, `bun run typecheck`, `bun run lint:fix`, the whole `modules/crm` suite once.
- [ ] **Step 5: Commit** `feat(crm): programs, the join QR, issuing a card and the public card view`.

---

### Task 5: Stamping, redeeming and voiding

**Files:**
- Create: `modules/crm/application/stamps.ts`
- Modify: `modules/crm/index.ts`
- Test: `modules/crm/tests/stamps.test.ts`

**Interfaces:**
- Consumes: Task 2 to 4; Core's `writeAudit`, `can`, `Scope`, `Tx`.
- Produces: `type CardLookup = { locationId: string } & ({ code: string } | { cardToken: string })`; `type StampResult = { cardId: string; stampsInCycle: number; stampsRequired: number; rewardEarned: boolean; rewardReady: boolean }`.
  - `stampCard(tx: Tx, scope: Scope, lookup: CardLookup, input: { idempotencyKey: string }, deps: CrmDeps): Promise<StampResult>`: needs `loyalty:stamp`; resolves the card by `(location_id, short_code)` (normalised) or by `token_hash` and location; a location or card not visible to the scope throws `CardNotFoundError` (the same error for unknown and out-of-scope); `pg_advisory_xact_lock` on the card; if an event with the same `idempotency_key` exists returns its stored result without writing; applies `canStamp` (throws `StampRefusedError` with `reason` and `retryAt`); appends the `stamp` event; when `stampsInCycle` reaches `stampsRequired` appends `reward_earned` and inserts a `loyalty_rewards` row; `writeAudit`; publishes `loyalty.stamp.added` and, on completion, `loyalty.reward.earned`; updates `last_stamp_at`.
  - `redeemReward(tx: Tx, scope: Scope, lookup: CardLookup, input: { idempotencyKey: string }, deps: CrmDeps): Promise<{ cardId: string; rewardId: string }>`: needs `loyalty:redeem`; same lookup and lock and idempotency; redeems the oldest unredeemed reward (`NoRewardError` if none), appends `reward_redeemed`, audit, publishes `loyalty.reward.redeemed`.
  - `voidLastStamp(tx: Tx, scope: Scope, input: { cardId: string; reason: string; idempotencyKey: string }, deps: CrmDeps): Promise<StampResult>`: needs `loyalty:manage`; appends a `void` event pointing at the latest stamp that is not voided and belongs to the current cycle (`NothingToVoidError` otherwise), audit with the reason (1 to 200 characters), no event is deleted.
  - Errors: `CardNotFoundError`, `StampRefusedError`, `NoRewardError`, `NothingToVoidError`.

- [ ] **Step 1: Write the failing tests:** stamping 8 times (cooldown 0) earns a reward exactly once and the 9th stamp starts a new cycle (`stampsInCycle` 1); the cooldown blocks the second stamp inside the window with `retryAt` and allows it at the exact boundary (inject `now`); **two concurrent `stampCard` calls with different idempotency keys on one card (Promise.all) with cooldown 240 produce exactly one stamp**; **two concurrent calls with the SAME key produce one stamp and the same result**; replaying a key after the card moved on returns the first result and adds no event; stamping by `cardToken` and by `code` (lower case with a dash) find the same card; a `client_staff` scope limited to location A cannot stamp a card of location B (`CardNotFoundError`, same as an unknown code); `account_manager` and `agency_admin` cannot stamp (`LoyaltyForbiddenError`) but can void; redeem with no reward throws `NoRewardError`, redeem after a reward clears `rewardReady`, redeeming twice with two keys throws on the second; a paused program refuses with `reason: "paused"`; void removes the last stamp from the count and a second void removes the one before; void with nothing to void throws; every successful stamp, redeem and void writes one audit row whose input contains ids only (assert no string equal to the code or token); events published carry ids only; the `loyalty_events` rows are never updated.
- [ ] **Step 2: Run to verify failure.** `cd modules/crm && bun test tests/stamps.test.ts`.
- [ ] **Step 3: Implement** in one transaction per call with the advisory lock taken first (`select pg_advisory_xact_lock(hashtextextended(<card id>, 0))` as in `modules/core/application/guests.ts`).
- [ ] **Step 4: Run to verify pass**; run the concurrency tests 20 times in a loop to prove they are stable (`for i in $(seq 20); do bun test tests/stamps.test.ts -t concurrent || break; done`); `bun run check:deps`, `bun run typecheck`, `bun run lint:fix`.
- [ ] **Step 5: Commit** `feat(crm): stamping, redeeming and voiding with a lock, idempotency and audit`.

---

### Task 6: Email opt-in, erasure, activity, summary, MCP

**Files:**
- Create: `modules/crm/application/email.ts`, `activity.ts`, `erasure.ts`, `modules/crm/mcp/tools.ts`
- Modify: `modules/crm/index.ts`
- Test: `modules/crm/tests/email-activity.test.ts`

**Interfaces:**
- Consumes: Task 2 to 5; Core's `resolveGuest`, `recordConsent`, `IdentityConflictError`, `InvalidContactError`, the `guest.erased` event consumer pattern (read `modules/reputation/application/erasure.ts`), the range and comparison helpers of the Overview are in Reputation and are NOT importable: write the small window and `change` math in `crm/domain` using plain functions (current window of N days against the previous window; `change` as percent for counts, null below 10 in either window).
- Produces:
  - `attachEmail(db: Database, input: { cardToken: string; email: string; consent: true }, deps: CrmDeps): Promise<{ ok: true } | { ok: false; reason: "invalid_email" | "unavailable" }>`: finds the card through `crm.card_scope`, `withTenant`, `resolveGuest` (email only) then `recordConsent` (`channel: "email"`, `purpose: "marketing"`, `granted: true`, `source: "loyalty_card"`), sets `guest_id`, publishes `contact.captured` (`{ guestId, source: "loyalty_card" }`) once per card; `consent` must be literally true: a missing or false consent does nothing and returns `consent_required` (so the reason union is `"invalid_email" | "unavailable" | "consent_required"`); an `IdentityConflictError` leaves the card unchanged and returns `unavailable` (the same answer as an unknown or closed card).
  - `eraseGuestCards(tx: Tx, guestId: string): Promise<number>` (sets `guest_id` to null on the guest's cards) and `crmErasureConsumer` shaped like `erasureConsumer` in Reputation.
  - `listActivity(tx: Tx, scope: Scope, input: { range: "7d" | "30d" | "90d"; locationId?: string; kind?: "stamp" | "reward_earned" | "reward_redeemed" | "void"; page: number; pageSize: number; sort: "date"; dir: "asc" | "desc"; now: Date }): Promise<{ rows: { id: string; at: string; kind: string; cardShortCode: string; locationId: string; locationName: string; actorName: string | null }[]; total: number; page: number; pageSize: number }>` (needs `loyalty:read`; `pageSize` capped at 100; rows show the short code, never a token).
  - `loyaltySummary(tx: Tx, scope: Scope, input: { range: "7d" | "30d" | "90d"; locationId?: string; now: Date }): Promise<{ cardsIssued: Tile; activeCards: Tile; stamps: Tile; rewardsEarned: Tile; rewardsRedeemed: Tile }>` with `type Tile = { value: number; change: number | null; small: boolean }`.
  - `crm.get_loyalty_card` MCP tool in `mcp/tools.ts` in the style of `modules/reputation/mcp/tools.ts` (read-only, initial level 4, returns the card's progress by short code and location, never a guest).

- [ ] **Step 1: Write the failing tests:** `attachEmail` creates a guest and a marketing consent with source `loyalty_card`, links the card, publishes `contact.captured` with ids only, and a second call for the same card publishes nothing more; no `crm` table and no event contains the email (query every `crm` table text column and the outbox for the address); without `consent: true` nothing is created; a bad email returns `invalid_email`; an email that already belongs to another guest returns `unavailable` and the card keeps `guest_id` null and the response is identical to the one for an unknown token; erasing the guest sets `guest_id` null and keeps the stamps; `listActivity` pages (25 per page default, cap 100), filters by kind and place, sorts by date, hides other clients, and an `assigned` scope sees only its clients; `loyaltySummary` counts a card issued today in the 7d window, gives `change` null under 10 in the previous window and a number at 10 or more, and returns zeros with no `NaN` for no data; the MCP tool returns progress and refuses a location outside the scope.
- [ ] **Step 2: Run to verify failure.** `cd modules/crm && bun test tests/email-activity.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass**; `bun run check:deps`, `bun run typecheck`, `bun run lint:fix`, the whole `modules/crm` suite.
- [ ] **Step 5: Commit** `feat(crm): the email opt-in, erasure, activity, the band figures and the card tool`.

---

### Task 7: The API routes

**Files:**
- Create: `apps/api/src/loyalty.ts`
- Modify: `apps/api/src/app.ts` (mount the public routes), `apps/api/src/cases.ts` (mount the session routes), `apps/api/src/server.ts` (read `LOYALTY_SECRET`, `TRUST_PROXY`), `apps/api/package.json` (`@atrium/crm`), `.env.example`
- Test: `apps/api/tests/loyalty.test.ts`

**Interfaces:**
- Consumes: Task 4 to 6; `AppDeps` (add `loyaltySecret?: string` and `trustProxy?: boolean`; the routes are mounted only when a secret is present).
- Produces (public, no session, under `/v1/loyalty`): `POST /v1/loyalty/cards` body `{ joinToken: string }` sets the httpOnly, `SameSite=Lax`, `Secure` (when HTTPS) cookie `atr_card_dev` if absent (a random id) and answers `201 { token, shortCode }`, or `410 { error: "invalid" | "paused" }`, `409 { error: "device_limit" }`, `429` with `Retry-After`; `GET /v1/loyalty/cards/:token` answers the `CardView` with `ETag`, `304` on a matching `If-None-Match`, `404` for unknown; `POST /v1/loyalty/cards/:token/email` body `{ email: string; consent: boolean }` answers `204` on success and `400 { error: "consent_required" | "invalid_email" }` or `404 { error: "unavailable" }`; reads count against the per-token limit; the client IP is read as in Global Constraints.
- Session routes (the `/api` group with the existing session middleware; each checks the permission, then `accessFor(...).retention !== "locked"`): `GET /api/loyalty/program?locationId=`, `PUT /api/loyalty/program` (body: `locationId` plus the program fields), `POST /api/loyalty/program/rotate-qr`, `GET /api/loyalty/program/join-link?locationId=` (answers `{ url }` built from `QR_CARD_URL` or `null` when unset, plus the signed `jq1` token), `POST /api/loyalty/stamps` and `POST /api/loyalty/redeem` (body `{ locationId, code?: string, cardToken?: string, idempotencyKey: string }`; exactly one of `code` and `cardToken`), `POST /api/loyalty/void` (body `{ cardId, reason, idempotencyKey }`), `GET /api/loyalty/activity` (query `range`, `place`, `kind`, `page`, `pageSize`), `GET /api/insights/loyalty?range=&place=` (the band). Errors: unknown range 422 `invalid_range`; non-UUID id 422 `invalid_id`; malformed body 422 `invalid_request`; `LoyaltyForbiddenError` 403; `CardNotFoundError` 404 `not_found`; `StampRefusedError` 409 `{ error: "refused", reason, retryAt }`; `NoRewardError` and `NothingToVoidError` 409; stamp attempts per staff user limited to 10 per minute (429).

- [ ] **Step 1: Write the failing tests** (harness: `apps/api/tests/surveys-admin.test.ts` and `apps/api/tests/cases.test.ts`: agency org, clients with owners and staff, assigned account manager, Better Auth sessions): the whole public flow (join with a valid token, read the card with the returned token, 304 on a matching ETag, stamp as client staff, read again sees the stamp, a full cycle earns a reward, redeem, email opt-in) works end to end; the join response sets the cookie and never takes a device id from the body (send a different `deviceId` in the body and assert it is ignored); a second join with the same cookie on the same program gives 409; a join token for another program or a survey QR token gives 410; **no response of any public route contains a guest field or the email**; an unknown token is 404 and a token with one character changed is 404; reads over the limit give 429 with `Retry-After`; a paused program answers the card with `state: "paused"` and status 200 and a stamp attempt 409 `paused`; session routes: no session 401; `client_staff` of location A stamps a card of location A (201) and gets 404 for location B; the same staff gets 403 on `PUT /api/loyalty/program`; `account_manager` gets 403 on stamps and 200 on program and void; a client with the `retention` feature locked gets the locked response on every session route; client A never sees client B's program, activity or band (distinctive names absent from the JSON); an `assigned` account manager sees only assigned clients in activity; a stamp with the same `idempotencyKey` twice returns the same body and one event; both `code` and `cardToken` together, or neither, give 422; the 11th stamp attempt of a staff user in a minute is 429; routes are not mounted (404) when `LOYALTY_SECRET` is absent; `X-Forwarded-For` is ignored unless `trustProxy` is true (assert two different forwarded IPs share a limit when not trusted).
- [ ] **Step 2: Run to verify failure.** `cd apps/api && bun test tests/loyalty.test.ts`.
- [ ] **Step 3: Implement** `loyalty.ts` with `mountLoyaltyPublic(app, deps)` and `mountLoyalty(api, deps, secrets)`; wire them where `mountSurvey` and `mountSurveyAdmin` are mounted; add the variables to `.env.example` with one-line comments (including that `QR_CARD_URL` is used by delivery B).
- [ ] **Step 4: Run to verify pass**; `bun run check:deps`, `bun run typecheck`, `bun run lint:fix`, the `apps/api` suite once.
- [ ] **Step 5: Commit** `feat(api): the loyalty routes, public and for staff`.

---

### Task 8: Docs, a demo seed, and the final check

**Files:**
- Create: `apps/docs/docs/guides/loyalty-and-qr-card.md` and the ES twin under `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/guides/`, `apps/docs/docs/adr/0022-loyalty-card-device-bound.md` and its ES twin, `apps/worker/scripts/seed-loyalty.ts`
- Modify: `apps/docs/docs/modules/crm.md` and ES twin (what is built; the loyalty model; the renamed event; the events catalog in `apps/docs/docs/architecture/events-and-contracts.md` and ES twin), both guides `index.md`, the ADR index (EN and ES), root `package.json` (`"seed:loyalty": "bun apps/worker/scripts/seed-loyalty.ts"`)
- Test: `apps/worker/tests/seed-loyalty.test.ts` for the pure plan helper if one exists

**Interfaces:**
- Produces: the guide (how a venue sets the program up and uses it, the limits, what is not there yet, delivery B screens as "coming"); ADR 0022 (Accepted, 2026-10-19: the card is anonymous and bound to a device, why web before wallet, why `security definer` lookups, the consequences); `bun run seed:loyalty` (dev only, refuses a non-local database like `seed-history.ts`, idempotent: creates an active program for each demo location that has none, prints for each location the program summary and the `joinToken`-based URL using `QR_CARD_URL` or `http://localhost:3006`, never a password); docs say EN and ES identical in facts (numbers, limits, routes).

- [ ] **Step 1: Write the pages, the ADR, the seed script and the edits.**
- [ ] **Step 2: Build the docs.** `bun run --filter @atrium/docs build`. Expected: success in EN and ES with no broken links.
- [ ] **Step 3: Smoke test with the real API** (Postgres up; `LOYALTY_SECRET` set in `.env.local`): run `bun run db:migrate`, `bun run seed:loyalty`, start the API, then with `curl`: join with the printed token (keep the cookie jar), read the card, stamp as the demo staff via a session cookie, and confirm the card shows the stamp; report the commands and responses in the task report.
- [ ] **Step 4: Run the whole CI.** `bun run ci`. Expected: lint, deps, typecheck and every test green. A flaky timeout is rerun once and then fixed by an explicit longer timeout with a comment.
- [ ] **Step 5: Commit** `docs(crm): the loyalty guide, ADR 0022, the demo seed`.
