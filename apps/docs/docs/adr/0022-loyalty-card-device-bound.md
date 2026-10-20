---
id: 0022-loyalty-card-device-bound
sidebar_position: 23
title: "0022 · The loyalty card is anonymous and bound to a device"
sidebar_label: "0022 · The loyalty card is anonymous and bound to a device"
description: "The loyalty card is anonymous and bound to a device"
---

# ADR 0022: The loyalty card is anonymous and bound to a device

| Status | Date | Deciders |
| --- | --- | --- |
| **Accepted** | 2026-10-19 | Atrium · product and technology |

## Context

Clients need a digital stamp card in the style of Rondafy: the guest scans a QR at the venue and has a card at once, with no form. Core cannot create a guest without an email or phone, and the guest should not have to give either to start. The relevant records (cards, stamps, rewards) must still land in Atrium's own data, with row-level security, an audit trail and events like every other module.

## Decision

- **The card is anonymous and belongs to a device, not to a person.** It is created with a random 128-bit token whose plaintext exists only in the guest's browser; the database keeps its sha-256 hash. A card gets a guest only if the guest opts in with an email and consent, at which point Core resolves the guest and records the consent (source `loyalty_card`). Several cards may point to one guest.
- **The device is a first-party cookie.** The API sets `atr_card_dev` (httpOnly, `SameSite=Lax`, `Path=/` on the card app's origin) and hashes its value with HMAC under `LOYALTY_SECRET`. A device id in a body is never read. The value is an unsigned UUID that the server minted; this is accepted because forging it only changes the device the forger is already.
- **Web before wallet.** The card is a web page that can be added to the home screen. Apple and Google Wallet need developer accounts that the owner has to open (a certificate and an issuer account), so passes come later behind the same card record.
- **A public join token, separate from the survey QR.** Wire format `jq1.<programId>.<version>.<sig>`, where the signature is an HMAC-SHA256 under `LOYALTY_SECRET` over `join:<programId>:<version>`. Rotating the version invalidates printed codes. A survey QR token can never verify as a join token, or the reverse.
- **Public lookups use `security definer` functions.** The caller of a public route has no tenant, so `crm.card_scope(token_hash)` and `crm.program_scope(program_id)` return the ids behind an exact full hash or id and nothing else (no listing, no prefix match), and the route then runs under that client's row-level security. This is the same approach as Core's `client_id_for_location`. Counters for the rate limits are written through `crm.hit_rate`.
- **Progress is derived from an append-only event log.** `stamp`, `reward_earned`, `reward_redeemed` and `void` are never updated or deleted. Stamp, redeem and void take an advisory lock on the card, are idempotent per card and key, and write an audit entry.
- **Events.** `loyalty.card.issued`, `loyalty.stamp.added`, `loyalty.reward.earned`, `loyalty.reward.redeemed` and `contact.captured`, with ids only. `loyalty.reward.earned` replaces the `loyalty.milestone.reached` of the earlier CRM page; that name was never in the contracts.
- **Access.** The feature is the `retention` package feature. Core gains the `loyalty` permission resource (`read`, `stamp`, `redeem`, `manage`): the agency roles read and manage, the client owner has all four, client staff read, stamp and redeem. Only client roles stamp or redeem.

## Consequences

- A guest on two phones has two cards. The email opt-in links both to one guest for the CRM, not their stamps. A lost phone means a new card.
- **The email opt-in is unverified.** Anyone who holds a card token can attach an address they know, and the consent is recorded for it. Double opt-in is delivery C.
- **Shared networks.** A venue's NAT shares the 20 joins per IP per hour. The 200 new cards per program per hour can be used up by abuse of the poster QR; the spec accepted that.
- **The device limit is anti-abuse, not integrity.** It is a rolling 24-hour count of issued cards per device and program, and concurrent joins may race past it.
- **Client IP.** The card app reaches the API only through a same-origin route handler at `/loyalty-api/*`, not a Next rewrite (a rewrite keeps the `X-Forwarded-For` the client wrote). The handler builds the upstream request from an allow-list, so it carries at most one `X-Forwarded-For`, the entry `QR_CARD_PROXY_HOPS` places from the right of the chain (none when that is 0, the default), and it caps request bodies at 8 KiB while streaming (`413`). qr-card must be reachable only through the counted proxies, and an entry that is not a bare IP (a port, for instance) fails closed. The API does not believe the header on its own word: for the loyalty routes it trusts `X-Forwarded-For` and `X-Forwarded-Proto` only when `TRUST_PROXY` is on, `LOYALTY_PROXY_SECRET` is 32 or more characters and the request carries it in `x-atrium-proxy`; otherwise it uses the socket address, and an untrusted `X-Forwarded-Proto` does not make the cookie `Secure`.
- **Known follow-up.** `apps/api/src/onboarding.ts` trusts `X-Forwarded-For` ungated. It is older than the loyalty routes and outside them.
- **IPv6 keying.** Rate limits key on the full address. A client with an IPv6 /64 can rotate through a whole prefix of addresses, so the per-IP limits do not hold against it; keying on the /64 is a follow-up.
- **The poller must send `If-None-Match` itself.** The public routes answer `Cache-Control: no-store`, so the browser will not do conditional requests alone. Delivery B's card page keeps the last body and the `ETag` and sends `If-None-Match`.
- **A void writes no event of its own for consumers.** Stamp consumers cannot net out voids; the Retention follow-up must handle it.
- **Local databases that applied an earlier `crm/0001`** during this branch need `drop schema crm cascade; delete from public.schema_migrations where module='crm'` and then `bun run db:migrate`.
- **The cookie is unsigned.** A UUID hashed with the secret, not a signed value. Accepted.
- **A completing stamp reports `stampsInCycle` equal to the stamps required**, while the card view shows 0 and `rewardReady`. Clients of the API must read both.
- **A void cannot cancel a stamp that earned a reward** in this version.
- **Redeem is allowed on a paused program and a closed card**, so an earned reward is never lost.
- **Retention gating is at the client level only.** There is no per-location gating.
- A paused program, a suspended location or a closed card answers 200 with a state; an unknown token is 404. A holder of the token learns nothing new from "closed".
- `crm.get_loyalty_card` exists in the module but is not registered in the agents service until delivery C gives the CRM agent a manifest. The worker does register the erasure consumer that detaches a card from an erased guest.
- Web cards have no lock-screen notices. Said plainly in the docs.

## Delivery B (2026-10-20)

The card app (`apps/qr-card`, port 3006), the Platform and Manager screens and the proxy above are built.

- **The card QR holds the short code (`XXXX-XXXX`), never the token.** A photo of the QR gives staff a lookup key and nothing that opens the card.
- **The token lives in the `/c/<token>` path**, so a home-screen shortcut made from the card page carries it. The join page replaces itself with the card page and the browser remembers the token in its own storage.
- **No web manifest.** A shortcut works; an installable app is not promised.
- The card app answers `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` and refuses framing, because a card URL is a credential. The card and join pages are rendered per request, so Next answers them with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`; the `/loyalty-api` handler answers `no-store`.
- **Known limitation: the card token is kept in the browser's `localStorage` only.** Spec §2 also names a cookie; it is not implemented. Safari clears script-written storage after about 7 days without interaction when the card was not added to the home screen, so a guest who rescans the table QR after that gets a new card (the device limit is 24 hours) and the old stamps are orphaned. A server-set `httpOnly` cookie is the possible follow-up.

## Discarded alternatives

- **Wallet passes first:** they block on accounts the owner has not opened, and the card record would have to exist anyway.
- **A card tied to an email from the start:** it asks the guest for data before giving anything, which is the friction the product removes, and Core cannot hold a guest without a contact.
- **A device id sent by the client:** trivially forged to get a second card.
- **A signed device cookie:** more machinery for a value that protects nothing the hash does not.
- **A rotating card QR:** the planned answer to screenshots, left for later; the cooldown and the staff's presence limit it today.
