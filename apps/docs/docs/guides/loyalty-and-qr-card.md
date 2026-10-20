---
sidebar_position: 3.8
title: "Loyalty and the stamp card"
description: "How a venue sets the stamp card up and uses it, how the card app reaches the API, the limits that apply, and what is not there yet."
---

# Loyalty and the *stamp card*

The stamp card is the loyalty part of the [CRM](../modules/crm). The guest scans a QR at the venue and gets a card in the phone's browser (the card app, `apps/qr-card`, port 3006) without giving any data. The staff add a stamp after each visit and hand out the reward when the card is full. Everything that happens lands in Atrium's own tables, next to the guests, consents and surveys the system already has.

## What a card is

- **Anonymous and bound to a device.** A card is created with no name, email or phone. The API sets a first-party cookie, `atr_card_dev`, on the first join and derives the device from it; a device id in a request body is ignored. See [ADR 0022](../adr/0022-loyalty-card-device-bound).
- **A web card, not a wallet pass.** It opens in the browser and can be added to the home screen. Apple and Google Wallet passes are a later delivery and will sit behind the same card record. A web card has no lock-screen notices.
- **Progress is derived.** A card's stamps are counted from its append-only event log (`stamp`, `reward_earned`, `reward_redeemed`, `void`), never stored as a running number.
- **The email is optional.** A guest can add an email with consent to hear about rewards. Only then does Core create or find a guest, and the consent is logged with the source `loyalty_card`. The email lives only in Core's guest tables.

## Use it

### The guest

1. The guest scans the printed join QR. It opens `<QR_CARD_URL>/j/<joinToken>`, which creates the card and replaces itself with `/c/<card token>`, so the join page is not in the Back history.
2. The card shows the venue, the grid of stamps in the program's accent, the reward, the short code (`XXXX-XXXX`) and a QR of that code. **The QR holds the short code, never the token.** A photo of the QR therefore gives no access to the card itself.
3. The card token lives in the `/c/<token>` path, so a home-screen shortcut made from that page opens the same card. There is no web manifest. The browser also remembers the card in its own storage and reopens it from the app's home page.
4. The page asks the API again every 5 seconds while it is visible and every 30 seconds when hidden, with `If-None-Match`, so an unchanged card costs a `304`. A `429` or a failure slows the polling down. A new stamp appears with an announcement for screen readers.
5. At the end the guest can add an email with a ticked consent box; it is optional and the form does not come back once it is done.

The card app sends `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` on its dynamic pages, and refuses to be framed, because a card URL is a credential. It makes no third-party request.

### The staff

On Platform the client's owner and staff see **Retention** with **Stamp a card**, **Loyalty activity** and **Program & QR**. On Manager the agency sees **Loyalty** with **Activity** (read-only) and **Programs & QR**. A client whose package locks Retention sees the locked page on all of them; the public card still opens.

1. **Stamp a card** (`/loyalty/stamp`, owner and staff). Pick the place, then type the card's code or scan the QR on the guest's phone. Then **Add stamp**; when the card is full, **Redeem**. The owner can also **Void last stamp**, with a reason of up to 200 characters.
2. The screen makes one idempotency key per action. A network error, a 5xx or a 429 keeps the key, so **Try again** reuses it and can never add a second stamp. A refused stamp (for instance by the cooldown) is final and shows the time to retry.
3. The camera scanner needs HTTPS or `localhost` and a browser with `BarcodeDetector` (Chrome on Android, for one). Nothing is uploaded. Where it is missing, typing the code always works.

### The owner

1. **Program & QR** (`/loyalty/program`). Set the stamps, the reward, the cooldown, the accent and whether the program is active, per place, then save. A paused program stops stamping; the card says "This card is paused".
2. **Rotate QR** invalidates every printed join QR at once; issued cards keep working.
3. **Print poster** gives one A4 sheet with the join QR. **Print table cards** gives four per A4 sheet, each in a 90 x 130 mm cell (two of the 148 x 105 mm cards first planned do not fit the printable width of an A4). Both open without the app frame, ready for the browser's print dialog.
4. **Activity** (`/loyalty/activity`) shows the summary band (cards issued, active cards, stamps, rewards earned and redeemed, against the previous window) and a table of stamps, rewards and cards, with the range, place and kind filters.

## Set the program up

One program per location. The fields and their limits:

| Field | Rule |
| --- | --- |
| Stamps needed | 2 to 20, default 8 |
| Reward | Text of 1 to 80 characters |
| Cooldown | 0 to 1440 minutes between two stamps on a card, default 240 (4 hours) |
| Accent | One of `lime`, `clay`, `charcoal`, `sage` (no logo upload yet) |
| Active | A paused program still answers, with `state: "paused"`, and cannot be stamped |

Setting the program up needs the `loyalty:manage` permission: the agency admin and the account manager (they set it up, they are not at the venue) and the client owner. The whole feature is the `retention` feature of the package: a client where it is locked gets `403 feature_locked` on every staff route (`/api/loyalty/*` and `/api/insights/loyalty`). The public join and card routes stay open.

| Route | Purpose |
| --- | --- |
| `GET /api/loyalty/program?locationId=` | Read the location's program |
| `PUT /api/loyalty/program` | Create or change it |
| `GET /api/loyalty/program/join-link?locationId=` | The join URL (`<QR_CARD_URL>/j/<joinToken>`) and the token to print as a QR |
| `POST /api/loyalty/program/rotate-qr` | Invalidate every printed join QR and issue a new one |

The join token has the form `jq1.<programId>.<version>.<signature>`. Rotating the QR raises the version, so printed codes stop working at once. It is independent from the survey QR.

## At the counter

Staff are the client's own roles: the owner and the staff. Stamping and redeeming are restricted to client roles, and to the locations the user can see.

| Action | Route | Who |
| --- | --- | --- |
| Add a stamp | `POST /api/loyalty/stamps` | client owner, client staff |
| Hand out the reward | `POST /api/loyalty/redeem` | client owner, client staff |
| Cancel the last stamp (a mistake) | `POST /api/loyalty/void` | `loyalty:manage` |

A stamp or a redeem takes a required `locationId`, either the short `code` (8 characters, shown `XXXX-XXXX`) or the `cardToken` read from the card's QR, and an `idempotencyKey`. Sending the same key twice is one stamp. Rules a stamp must pass:

- the program is active and the card is open;
- the cooldown has passed: exactly the cooldown after the last stamp is allowed, one second earlier is refused with `409 refused` and the time to retry;
- a location outside the user's scope answers the same "not found" as an unknown code.

When the last stamp lands, the card earns a reward in the same transaction. The stamp answer then reports `stampsInCycle` equal to the stamps required, while the card view shows 0 and `rewardReady: true`. Redeeming is allowed on a paused program and a closed card, so a reward already earned is never lost.

A void cancels the latest stamp that was not voided and never deletes anything. A stamp that earned a reward cannot be voided in this version.

## What the owner sees

- `GET /api/insights/loyalty?range=7d|30d|90d&place=` returns the band figures: cards issued, active cards, stamps, rewards earned and rewards redeemed, with change against the previous window.
- `GET /api/loyalty/activity` lists stamps, rewards and cards with server-side paging, a `kind` filter and the same range and place.

Platform and Manager show these on the Activity page, see [Use it](#use-it).

## The guest's side

The public routes need no session, and the card token in the path is the only secret. Nothing they return holds a guest or an address.

| Route | Purpose |
| --- | --- |
| `POST /v1/loyalty/cards` | Join with a `joinToken`. Returns the card token and short code once, and sets the device cookie. |
| `GET /v1/loyalty/cards/:token` | The card: brand, reward, stamps, `rewardReady`, `state`. Supports `ETag` and `If-None-Match` (a 304 has no body). |
| `POST /v1/loyalty/cards/:token/email` | The optional opt-in: `{ email, consent: true }`. Answers 204. |

Join errors: `410 invalid` for a bad, rotated or foreign token and `410 paused` for a paused program, `409 device_limit` when the device already has a card, and `429` with `Retry-After` over a limit.

A paused program, a suspended location or a closed card answers 200 with `state: "paused"` or `"closed"`. An unknown or malformed token is 404. Cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when the request is https, when a trusted proxy says it was, when `QR_CARD_URL` starts with `https://`, or in production.

## How the card app reaches the API

The browser never calls the API directly. The card app has a same-origin route handler at `/loyalty-api/*` that forwards the three card routes (`POST /cards`, `GET /cards/<token>`, `POST /cards/<token>/email`) to `<API_URL>/v1/loyalty/...`, and nothing else. It is a route handler, not a Next rewrite, because a rewrite keeps the `X-Forwarded-For` the client wrote.

- **It rewrites the headers instead of passing them on.** The request to the API is built from an allow-list (`content-type`, `accept`, `accept-language`, `if-none-match` and the device cookie), never copied. It carries at most one `X-Forwarded-For`, the client address the handler worked out itself; whatever the client sent is dropped. `X-Forwarded-Proto` is passed on only when a trusted proxy is counted.
- **The client address** is the entry `QR_CARD_PROXY_HOPS` places from the right of the `X-Forwarded-For` the proxies in front appended. With `QR_CARD_PROXY_HOPS=0` (the default) the handler sends no address, and the API counts the card app's own socket: every guest shares the same limits. In production set it to the number of proxies you run in front of qr-card. qr-card must be reachable only through those proxies, or a client could write the entry that is counted. An entry that is not a bare IP address (for instance one with a port) is dropped, so the API falls back to the socket.
- **The body is capped at 8 KiB** while it streams; a bigger one is answered `413` and the rest is never read.
- **The device cookie** `atr_card_dev` is passed both ways, and its `Path` is rewritten to `/loyalty-api` so the browser sends it to that route only. Every answer carries `Cache-Control: no-store`; `ETag` and `Retry-After` pass through.
- **The API decides whether to believe the address.** `TRUST_PROXY` alone is not enough. For the loyalty routes the API trusts `X-Forwarded-For` and `X-Forwarded-Proto` only when `TRUST_PROXY` is on, `LOYALTY_PROXY_SECRET` is 32 characters or more, and the request carries the same value in an `x-atrium-proxy` header (compared in constant time). The handler adds that header from its own copy of the secret. Otherwise the API uses the socket address and ignores `X-Forwarded-Proto` for the `Secure` cookie too: it fails closed, and the API logs a warning at start when `TRUST_PROXY` is on without a usable secret.
- **Known follow-up.** `apps/api/src/onboarding.ts` still trusts `X-Forwarded-For` without this gate. It is older than the loyalty routes and outside them.

## The limits

Counters live in Postgres and a limit answers `429` with `Retry-After`.

| Limit | Value |
| --- | --- |
| Join attempts per IP address | 20 per hour |
| Cards per device per program | 1 per rolling 24 hours |
| New cards per program, whoever joins | 200 per hour |
| Reads per card token | 120 per minute |
| Stamp attempts per staff user | 10 per minute |
| Redeem attempts per staff user | 10 per minute, a separate bucket from stamps |
| Email opt-in per card token | 120 per minute |
| Email opt-in per IP address | 20 per hour |

Two consequences to know before a launch: a venue's shared WiFi shares the 20 joins per IP per hour, and the 200 cards per program per hour can be used up by someone abusing the poster QR. The device limit is anti-abuse, not integrity: two joins at the same instant can race past it.

## Settings

| Variable | Effect |
| --- | --- |
| `LOYALTY_SECRET` | Signs the join tokens and hashes the device cookie. At least 32 characters. Without it, or with a shorter one, the loyalty routes are not mounted. |
| `TRUST_PROXY` | Set to `1` when the card app (or a proxy you control) sits in front of the API. On its own it changes nothing for the loyalty routes: it also needs `LOYALTY_PROXY_SECRET`. |
| `LOYALTY_PROXY_SECRET` | 32 characters or more, the same value for the API and qr-card. The API believes `X-Forwarded-For` on a loyalty route only with `TRUST_PROXY` and a matching `x-atrium-proxy` header. |
| `QR_CARD_PROXY_HOPS` | Read by qr-card. How many trusted proxies sit in front of it in production. `0` by default. |
| `API_URL` | Read by qr-card as well: where `/loyalty-api` forwards to. Default `http://localhost:3001`. |
| `QR_CARD_URL` | Public origin of the card app, used in the printable join URL. Default in development: `http://localhost:3006`. |

## Try it locally

`bun run seed:loyalty` (development only) gives each demo location an active program and prints each location's join URL. Start the database, the API and the card app with the [local development](./local-development) guide, open a printed join URL on a phone-sized window, then sign in to Platform as `demo-owner@demo.test` and stamp the card from **Retention**.

## What is not there yet

- Wallet passes and wallet notices (delivery D).
- Guest segments, automations, campaigns and the lifecycle (delivery C). The email opt-in is not verified: anyone holding a card token can attach a known address, and a confirmation email (double opt-in) comes with delivery C.
- A logo on the card (it needs file storage), several cards per venue, tiers.
- A web manifest for the card: a home-screen shortcut works from the `/c/<token>` URL, but it is not an installable app.
- The agent tool `crm.get_loyalty_card` exists but is not registered in the agents service until the CRM agent has its manifest.
