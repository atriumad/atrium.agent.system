# CRM loyalty core and the qr-card app

Date: 2026-10-19
Status: draft for review
Deliveries A and B of the CRM track. Later deliveries (C, D) are outlined at the end and get their own specs.

## Goal

Give Atrium's clients (restaurants and other local businesses) a digital stamp card in the style of Rondafy (https://rondafy.es): the guest scans a QR at the venue, gets a card with the venue's brand in their phone's browser without giving any data, and the staff add a stamp after each visit and hand out the reward when the card is full. What happens (cards, stamps, rewards) lands in Atrium's own data, next to the guests, consents, surveys and signals the system already has, and shows up in the Platform (for the client) and the Manager (for the agency).

To do that, the CRM module (`modules/crm`, designed in `apps/docs/docs/modules/crm.md` and empty today) gets built, starting with its loyalty part. `qr-card` is the new public app that the guest opens.

## What was asked, and what I assumed

Asked: create a new app in the system, `qr-card`, based on Rondafy; study the site to understand what is needed; use the same brand tokens and the same look as the rest of the product; and, because the module needs it, build the CRM module first.

What Rondafy does (from its site): a business designs a card (logo, colours, reward, number of stamps); the guest scans a QR and saves the card to Apple or Google Wallet in about ten seconds with no app and no form; staff add stamps and redeem rewards from a web panel by scanning the guest's card; the owner sees active, new and recurring clients, visits per week, retention and segments (near a reward, at risk); notices go out when a stamp is added, a reward is ready, a guest has a birthday or has not come back, and to ask for a Google review. Plans run from 14.99 to 49.99 euros a month with a 14-day trial and no lock-in.

Agreed in the session:
- Two deliveries in this order: the CRM module's loyalty core first, then the `qr-card` app on top of it.
- The card activates **without asking the guest for anything**. An email, with consent, is a separate optional step ("tell me about my rewards").
- The look is the product's: cream paper, ink outline, lime as the single accent, Inter Tight and Instrument Serif, the tokens in `packages/ui`.

My calls (the user can overrule):
- **A web card first, not Apple/Google Wallet.** Wallet passes need an Apple developer certificate (annual fee, every pass signed) and an approved Google Wallet issuer account. Both are accounts the owner has to open. The card is a web page that can be added to the home screen; wallet passes are delivery D and slot in behind the same card record.
- **`qr-card` is its own Next.js app** (`apps/qr-card`), public like the Hub, separate from the Hub so that card traffic and survey traffic scale and deploy apart. It reuses `packages/ui`.
- **A card belongs to a device, not to a person.** It is created anonymously (a random token kept in the guest's browser). A card gets a guest only if the guest opts in with an email, at which point Core's `resolveGuest` and `recordConsent` run. Several cards may point to one guest (a guest who joined from two phones).
- **Stamping is a staff action with an authenticated session.** The guest never stamps themselves. The staff screen finds a card by scanning the QR shown on the guest's card or by typing the card's short code.
- **Fraud limits in the first release:** one stamp per card per cooldown (default 4 hours, per program), an idempotency key per stamp, a full audit entry, and stamps restricted to staff of that location. A rotating QR on the card (screenshot-proof) is left for later.
- **Access follows the package:** the whole loyalty feature is the existing `retention` feature (full in Pillar 3). A client without it sees the locked teaser like every other locked module.
- **Email only, no SMS** (ADR 0021). Wallet push notices come with delivery D.
- **No metrics pipeline in A.** Loyalty publishes events. Mapping them to `signals_daily` (the types `loyalty_signup`, `redemption`, `repeat_visit`, `opt_in` already exist) is a follow-up, because it belongs to the Retention engine.

## Where things are today

- `modules/crm` is an empty folder. The CRM docs describe the guestbook, segments, automations, campaigns, loyalty (visit-based tiers, the 5-visit milestone), the guest lifecycle, the MCP tools (`crm.get_guest`, `crm.list_segment`, `crm.fire_automation`, `crm.draft_campaign`, `crm.send_campaign`, `crm.recognize_milestone`), and the events `contact.captured`, `automation.fired`, `campaign.sent`, `loyalty.milestone.reached`; the agent is Sommelier.
- Core has `guests` (id, client, name, erased_at), `guest_identifiers` (kind email or phone, value), `consents` (channel, purpose, granted, source; append-only), and the functions `resolveGuest` (an email or phone is **required**: a guest cannot be created anonymously), `recordConsent`, `recordOptOut`, `canContact`, `eraseGuest`. Events carry ids only, never an email or phone.
- Each module is a package with `domain/` (pure), `application/` (use cases through a `Tx`), `infra/schema.ts` (Drizzle), `migrations/NNNN_name.sql` (its own Postgres schema, `grant usage` to `atrium_app`, row-level security), `mcp/tools.ts`, `tests/`, and a public `index.ts`. Modules may import only `core`'s public API, `contracts` and `scoring`, never each other (`bun run check:deps`).
- Reputation is the nearest example: per-location settings with a `qr_version` that invalidates printed QRs, signed QR tokens (`signQrToken` / `verifyQrToken` in `domain/invitations.ts`), invitation tokens stored hashed, a per-device hash with a time window, and public routes in `apps/api` that the Hub calls.
- The permission matrix (`modules/core/domain/roles.ts`) has no loyalty resource, and `client_staff` can only read surveys. The access matrix has the `retention` feature: locked for Essential and Pillar 2, full for Pillar 3.
- The Hub is the public surface (`apps/hub`): `/q/[token]` is the printed-QR survey, `/s/[token]` an invitation, `/u/[token]` an unsubscribe.

## Design

### 1. The CRM module (delivery A)

New package `@atrium/crm` in `modules/crm`, standard shape. Postgres schema `crm`, migration `0001_loyalty.sql`.

**Tables** (every row has `client_id`, row-level security as in Reputation, foreign keys to `core.locations (client_id, id)`):

| Table | Purpose and key columns |
| --- | --- |
| `crm.loyalty_programs` | One per location (v1; the model allows more later). `location_id` (unique), `name`, `stamps_required` (2 to 20, default 8), `reward_label` (text), `cooldown_minutes` (default 240), `active`, `join_qr_version` (rotating it invalidates printed join QRs), `brand` jsonb (logo reference and accent colour from the allowed brand palette), `updated_at`. |
| `crm.loyalty_cards` | `id`, `program_id`, `location_id`, `token_hash` (unique, sha-256 of a 128-bit random token), `short_code` (8 characters, unique per location, no look-alike letters), `guest_id` (nullable), `device_hash`, `created_at`, `last_stamp_at`, `closed_at`. |
| `crm.loyalty_events` | Append-only. `id`, `card_id`, `kind` (`stamp` / `reward_earned` / `reward_redeemed` / `void`), `actor_id` (the staff user; null for the system), `idempotency_key` (unique per card), `note`, `created_at`. Nothing is updated or deleted. |
| `crm.loyalty_rewards` | `id`, `card_id`, `earned_at`, `redeemed_at`, `redeemed_by`. Created when a card reaches `stamps_required` stamps since its last reward. |

A card's progress is **derived from events**, not stored: stamps since the last earned reward. A pure function in `domain/` computes it, so there is one rule.

**Domain (pure):** `progress(events, stampsRequired)`, `canStamp(card, program, now)` (cooldown, program active, card not closed), `shortCode()` generation and its alphabet, token generation and hashing, state of a reward, and the guest lifecycle states from the CRM docs as a type (computed in delivery C).

**Use cases (`application/`)**, all through a `Tx` and the caller's scope:
- `getProgram`, `upsertProgram` (requires `loyalty:manage`).
- `issueCard(tx, { joinToken, deviceId })`: verifies the signed join token for the location and `join_qr_version`, applies a per-device limit (one card per device per program per day), creates the card and returns the **plaintext card token once**. Publishes `loyalty.card.issued`.
- `getCardByToken(tx, token)`: the card's public state: the program's brand and reward, stamps so far, stamps needed, whether a reward is ready, the short code. No guest data.
- `stampCard(tx, scope, { code | tokenHash, idempotencyKey })`: finds the card by short code or by the QR's token, checks the staff member's location, applies `canStamp`, appends a `stamp` event, and if the card reaches the goal appends `reward_earned` and creates the reward, all in one transaction with an advisory lock on the card. Writes an audit entry (`writeAudit`). Publishes `loyalty.stamp.added` and, on completion, `loyalty.milestone.reached`.
- `redeemReward(tx, scope, { cardId | code })`: marks the oldest unredeemed reward redeemed, appends `reward_redeemed`, audit entry, publishes `loyalty.reward.redeemed`.
- `voidLastEvent(tx, scope, { cardId, reason })` (`loyalty:manage`): appends a `void` that cancels the last stamp (a staff mistake), never deletes.
- `attachEmail(tx, { cardToken, email, consent })`: `resolveGuest` then `recordConsent` (channel email, purpose marketing, source `loyalty_card`) then sets `guest_id` on the card. A guest conflict (`IdentityConflictError`) leaves the card as it was and answers a neutral "we could not link it". Publishes `contact.captured` (ids only).
- `listActivity(tx, scope, filters)`: stamps, rewards and cards for the Platform and Manager tables, with the paging and filters of the data-table pattern (server-side).
- `summary(tx, scope, range, place?)`: the band figures for the section page: cards issued, active cards (stamped in the range), stamps, rewards earned and redeemed, with change against the previous window and the Overview's units and small-sample rule.
- Erasure: a consumer of `guest.erased` sets `guest_id` to null on the guest's cards (the card and its stamps stay, anonymous).

**Core changes:** a new resource in the permission matrix, `loyalty: ["read", "stamp", "redeem", "manage"]`, granted as: `agency_admin` and `account_manager` read and manage (they set programs up and void mistakes, they are not at the venue); `agency_staff` read; `client_owner` all four; `client_staff` read, stamp and redeem (the people who actually stamp). Only client roles can stamp or redeem. A Core migration adds the consent source `loyalty_card` to the `consents_source_check` constraint, and `CONSENT_SOURCES` in `contact.ts` gains the value. Guests are still created only with an email or phone.

**Contracts (`packages/contracts`):** the events `loyalty.card.issued`, `loyalty.stamp.added`, `loyalty.reward.earned` (the docs' `loyalty.milestone.reached` is renamed here to this clearer name and the doc updated; a doc ADR note records it), `loyalty.reward.redeemed`, `contact.captured`, each versioned, ids only.

**API (`apps/api`, mounted by a new `http/` layer of the module):**
- Public, token-authenticated, rate-limited, with CORS for the `qr-card` origin: `POST /v1/loyalty/cards` (join), `GET /v1/loyalty/cards/:token`, `POST /v1/loyalty/cards/:token/email`.
- Session-authenticated (staff and owners): `POST /api/loyalty/stamps`, `POST /api/loyalty/redeem`, `POST /api/loyalty/void`, `GET`/`PUT /api/loyalty/program`, `GET /api/loyalty/activity`, `GET /api/insights/loyalty` (the band). Each checks the permission and the `retention` access level; a client without access gets the same locked answer the other modules give.

**MCP:** the docs' read tool `crm.get_guest` and a new read tool `crm.get_loyalty_card` (initial level 4); no write tools in A.

### 2. The qr-card app (delivery B)

New app `apps/qr-card` (Next.js 16, port 3005 in development), public, no sign-in, using `packages/ui` and the brand tokens. Screens:
- **`/j/[joinToken]`** (the printed join QR): creates the card (a call to `POST /v1/loyalty/cards`), stores the card token in `localStorage` and a cookie, and redirects to the card.
- **`/c/[token]`** (the card): the venue's brand at the top (logo, name), a stamp grid with the filled and empty stamps (stamps are drawn, not images), "3 of 8", the reward text, the short code and a QR of the card for the staff to scan, a ready-to-redeem state with the reward highlighted (the one lime accent), an "Add to your home screen" hint, and the optional step "Tell me about my rewards" (email with a consent checkbox and a plain sentence on how to unsubscribe). It refreshes itself every few seconds while open so the guest sees the stamp arrive.
- **Not found / expired / program paused** states in plain language.
- No guest data is ever shown on the public card; a guest who lost their phone starts a new card.

Staff and owners use the **Platform** (client): a "Loyalty" section under the Retention module: a **Stamp** screen (scan the card with the camera using the browser's barcode detector, or type the short code; shows the card's progress and a big "Add stamp" button; a redeem button when a reward is ready; the last stamps for that card), the **program setup** (stamps needed, reward text, cooldown, brand, the printable join QR), and an **Activity** data page in the section-page pattern (summary band plus table with filters, sorting and paging). The **Manager** (agency) gets the same Activity page read-only across clients plus the program setup for the clients it manages. These screens belong to delivery B and use the pieces already built (`DataSectionPage`, `KpiTile`, `PageControls`, dense `DataTable`).

**Printables:** the join QR as a printable table card, in the same way Forms & QR does for surveys (the Reputation module already renders a printable card; the join card reuses that approach and the brand tokens).

### 3. Security and privacy

- Card and join tokens are random, high-entropy, stored hashed; the plaintext card token exists only in the guest's browser. Comparing hashes is constant-time.
- The public routes are rate-limited by IP and by device hash; issuing is limited to one card per device per program per day; a per-card stamp cooldown stops double stamping.
- Public answers carry no personal data. An email is collected only through the opt-in, with a logged consent, and is stored only in Core's guest tables, never in `crm` tables or in events.
- Stamping and redeeming are transactional, idempotent (the same idempotency key twice is one stamp) and audited with the staff user.
- Row-level security on every `crm` table, as Reputation. The public routes run with a purpose-built role path that can read and write only the card they were given the token for.
- A card whose location is suspended or whose program is paused answers "this card is paused" and cannot be stamped.

### 4. Testing

- Pure functions: progress, `canStamp` at the cooldown boundary, short-code alphabet and uniqueness handling, token hashing.
- Use cases against the real database, in the repo's pattern: stamp until a reward, the cooldown, the same idempotency key twice, a stamp by staff of another location (refused), redeem with no reward (refused), void, attaching an email (guest and consent created, event has ids only), attaching an email that already belongs to another guest, erasure detaching the guest.
- Tenancy: a client never sees another client's programs, cards or activity; an `assigned` account manager only assigned clients.
- Public routes: expired and rotated join tokens, a forged card token, rate limits, no personal data in any response, CORS.
- UI (qr-card): the card states, the stamp arriving through refresh, the email step with consent, the paused card. UI (Platform): the Stamp screen with a fake scanner, the Activity page like the other data pages.
- Migrations tested on an empty and on a populated database.

### 5. Docs

EN and ES: a CRM module page update (what is built, the loyalty model, events renamed), a guide "Loyalty and the qr-card app" (how a venue sets it up and uses it), an ADR "Loyalty card as a device-bound anonymous card" (why anonymous and why web before wallet), and the Platform and Manager product pages.

## Settled during review

A builder read the design and asked what it still needed. Each answer below was decided by the code or by a call recorded here.

**Facts the first draft had wrong or left open**
- **Consent source needs a Core migration** (see section 1): `consents.source` is a database check constraint plus a TypeScript list; both change.
- **The retention gate has no existing helper in `apps/api`.** The loyalty routes resolve the client's level with Core's `accessFor` (as `GET /api/access` does) and answer the same locked response when `retention` is locked.
- **Port 3005 is taken by the agents service.** `qr-card` uses **3006**. New environment variables: `QR_CARD_URL` (the public origin, used in the printable join QR), `LOYALTY_SECRET` (signs join tokens; the API refuses to start the loyalty routes without it), `TRUST_PROXY` (see rate limits).

**Calls made here**
- **How a public request finds a card under row-level security.** A `security definer` function in the `crm` schema, `crm.card_scope(token_hash)`, returns `(client_id, location_id, card_id)` for an exact hash match and nothing else (no listing, no partial match), in the same way as Core's `client_id_for_location`; the route then runs `withTenant` for that client. The migration tests that it cannot enumerate cards (a wrong hash and a prefix both return no row). The card token stays a random 128-bit value, with no ids inside.
- **The stamp endpoint needs the location.** `POST /api/loyalty/stamps` and `/redeem` take a required `locationId` plus either `code` (short code, unique per location) or `cardToken` (from the QR). The Platform's stamp screen has the place selector and pre-selects the only place of a staff user who has one. A code in two locations of one client is not a collision because the location is part of the lookup. A location outside the caller's scope returns the same "not found" as an unknown code.
- **The join token has its own format and secret.** `jq1.<programId>.<join_qr_version>.<signature>`, an HMAC under `LOYALTY_SECRET` over `join:<programId>:<version>`. A survey QR (`qr1...`, `SURVEY_SECRET`) can never verify as a join token or the reverse. Rotating `join_qr_version` and the survey `qr_version` are independent. The join route resolves the client through a second `security definer` function, `crm.program_scope(program_id)`.
- **No CORS, a first-party device cookie.** `qr-card` calls the API through a same-origin Next rewrite (`/loyalty-api/*` to the API), as the Hub does. The API sets an httpOnly device cookie (`atr_card_dev`) on join; the device hash is derived from that cookie on the server and a device id in a request body is ignored. The card token is also kept in `localStorage` so a cleared cookie does not lose the card.
- **Rate limits are new infrastructure and have their own task.** Counters live in Postgres (`crm.rate_counters`: key, window start, count, with a periodic purge), behind a pure function in `domain/`. Keys: client IP (first hop of `X-Forwarded-For` only when `TRUST_PROXY=1`, else the socket address), device hash, and the card. Limits: 20 join attempts per IP per hour; 1 card per device per program per day; 200 new cards per program per hour; 120 reads per minute per card token; 10 stamp attempts per minute per staff user. Over the limit answers 429 with `Retry-After`.
- **The public card polls gently.** Every 5 seconds while the tab is visible and every 30 while it is hidden; the route supports `ETag` and `If-None-Match` (a 304 costs no body), which a normal cycle never trips the read limit.
- **Row-level security** on every `crm` table filters by `client_id` and by the caller's visible locations, exactly as Reputation's `0006_location_scope.sql` does for `survey_responses`; the application layer adds the `loyalty:*` permission check and `locationVisible`.
- **Events.** `loyalty.reward.earned` is the canonical name; the docs' `loyalty.milestone.reached` is removed from the CRM page and from nothing else (it was never in the contracts). `contact.captured` carries `{ guestId, source: "loyalty_card" }`. A paused program, a suspended location or a closed card answers **200** with `state: "paused"` or `"closed"` (not 404/410), because the token is the only secret and an answer of "closed" reveals nothing a holder of the token does not already know.
- **Brand in v1** is the venue name (the location's name) plus an **accent chosen from the product's closed palette** (lime, clay, charcoal, sage). There is **no logo upload** in A and B because the repository has no file storage; a logo is a follow-up with the storage decision.

## Out of scope (A and B)

- Apple and Google Wallet passes and wallet push notices (delivery D).
- Guest segments, the lifecycle computation, automations (welcome, birthday, win-back), campaigns, cohorts and the Sommelier agent's writing tools (delivery C).
- Scratch-and-win, several cards per venue, tiers and VIP, a birthday field.
- A logo upload for the card (needs file storage).
- A rotating (anti-screenshot) card QR, NFC, SMS.
- Mapping loyalty events to `signals_daily` and the Retention metrics.
- Importing a guest list; merging two guests (existing `IdentityConflictError` rule stays explicit).
- A native mobile screen (Expo).

## Roadmap after this

- **C: Guestbook, segments and automations.** The CRM docs' remaining parts, using the events from A and B, Resend for email, `canContact` on every send.
- **D: Wallet passes.** Apple Wallet and Google Wallet behind the same card record; needs the owner's developer accounts.

## Risks

- **Wallet expectations.** Rondafy's selling point is the wallet. A web card is weaker (no lock-screen notices). Mitigation: it is said plainly in the docs; the card record is the same, so passes can follow without rework.
- **Fraud by a shared card.** A screenshot of a card's QR can be shown by someone else. The cooldown and the staff's presence limit it; a rotating code is the planned answer.
- **Anonymous cards and duplicates.** A guest on two phones has two cards. Accepted; email opt-in links both to one guest for the CRM, not the stamps.
- **Public traffic.** `qr-card` and the join QR are public: abuse (card creation floods). Mitigation: per-device and per-IP limits, a cap on cards per program per hour, and tests.
- **Package gating.** `retention` is only full in Pillar 3. If clients without it should get a basic card, that is a decision on package tiers (already open in the docs).
