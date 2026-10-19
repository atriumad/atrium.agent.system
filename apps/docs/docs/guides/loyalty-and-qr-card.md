---
sidebar_position: 3.8
title: "Loyalty and the stamp card"
description: "How a venue sets the stamp card up and uses it, the limits that apply, and what is not there yet."
---

# Loyalty and the *stamp card*

The stamp card is the loyalty part of the [CRM](../modules/crm). The guest scans a QR at the venue and gets a card in the phone's browser without giving any data. The staff add a stamp after each visit and hand out the reward when the card is full. Everything that happens lands in Atrium's own tables, next to the guests, consents and surveys the system already has.

:::note
Today the API and the data are built; the guest's card page (`apps/qr-card`) and the Platform and Manager screens are delivery B and are marked **coming** below. Until then the routes can be exercised with `curl` and the demo seed, see [the demo](#try-it-locally).
:::

## What a card is

- **Anonymous and bound to a device.** A card is created with no name, email or phone. The API sets a first-party cookie, `atr_card_dev`, on the first join and derives the device from it; a device id in a request body is ignored. See [ADR 0022](../adr/0022-loyalty-card-device-bound).
- **A web card, not a wallet pass.** It opens in the browser and can be added to the home screen. Apple and Google Wallet passes are a later delivery and will sit behind the same card record. A web card has no lock-screen notices.
- **Progress is derived.** A card's stamps are counted from its append-only event log (`stamp`, `reward_earned`, `reward_redeemed`, `void`), never stored as a running number.
- **The email is optional.** A guest can add an email with consent to hear about rewards. Only then does Core create or find a guest, and the consent is logged with the source `loyalty_card`. The email lives only in Core's guest tables.

## Set the program up

One program per location. The fields and their limits:

| Field | Rule |
| --- | --- |
| Stamps needed | 2 to 20, default 8 |
| Reward | Text of 1 to 80 characters |
| Cooldown | 0 to 1440 minutes between two stamps on a card, default 240 (4 hours) |
| Accent | One of `lime`, `clay`, `charcoal`, `sage` (no logo upload yet) |
| Active | A paused program still answers, with `state: "paused"`, and cannot be stamped |

Setting the program up needs the `loyalty:manage` permission: the agency admin and the account manager (they set it up, they are not at the venue) and the client owner. The whole feature is the `retention` feature of the package: a client where it is locked gets `403 feature_locked` on every loyalty route.

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

The Platform and Manager screens for these (the Stamp screen with a camera scanner, the program setup, the printable join card and the Activity page) are **coming** in delivery B.

## The guest's side

The public routes need no session, and the card token in the path is the only secret. Nothing they return holds a guest or an address.

| Route | Purpose |
| --- | --- |
| `POST /v1/loyalty/cards` | Join with a `joinToken`. Returns the card token and short code once, and sets the device cookie. |
| `GET /v1/loyalty/cards/:token` | The card: brand, reward, stamps, `rewardReady`, `state`. Supports `ETag` and `If-None-Match` (a 304 has no body). |
| `POST /v1/loyalty/cards/:token/email` | The optional opt-in: `{ email, consent: true }`. Answers 204. |

A paused program, a suspended location or a closed card answers 200 with `state: "paused"` or `"closed"`. An unknown or malformed token is 404. Cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when the request is https, when a trusted proxy says it was, when `QR_CARD_URL` starts with `https://`, or in production.

## The limits

Counters live in Postgres and a limit answers `429` with `Retry-After`.

| Limit | Value |
| --- | --- |
| Join attempts per IP address | 20 per hour |
| Cards per device per program | 1 per rolling 24 hours |
| New cards per program, whoever joins | 200 per hour |
| Reads per card token | 120 per minute |
| Stamp and redeem attempts per staff user | 10 per minute |

Two consequences to know before a launch: a venue's shared WiFi shares the 20 joins per IP per hour, and the 200 cards per program per hour can be used up by someone abusing the poster QR. The device limit is anti-abuse, not integrity: two joins at the same instant can race past it.

## Settings

| Variable | Effect |
| --- | --- |
| `LOYALTY_SECRET` | Signs the join tokens and hashes the device cookie. Without it the loyalty routes are not mounted. |
| `TRUST_PROXY` | Set to `1` only when a proxy you control sets `X-Forwarded-For`. Then the first hop is the client address; otherwise the socket address is. |
| `QR_CARD_URL` | Public origin of the card app, used in the printable join URL. Default in development: `http://localhost:3006`. |

## Try it locally

`bun run seed:loyalty` (development only) gives each demo location an active program and prints each location's join URL. See the [local development](./local-development) guide to start the database and the API first.

## What is not there yet

- The card page and the Platform and Manager screens (delivery B).
- Wallet passes and wallet notices (delivery D).
- Guest segments, automations, campaigns and the lifecycle (delivery C). The email opt-in is not verified: anyone holding a card token can attach a known address, and a confirmation email (double opt-in) comes with delivery C.
- A logo on the card (it needs file storage), several cards per venue, tiers.
- The agent tool `crm.get_loyalty_card` exists but is not registered in the agents service until the CRM agent has its manifest.
