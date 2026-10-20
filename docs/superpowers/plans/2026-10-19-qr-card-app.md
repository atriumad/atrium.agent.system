# The qr-card app and the loyalty staff screens (Delivery B): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the guest's stamp card (`apps/qr-card`, port 3006: scan the printed QR, get a card, watch the stamp arrive), the Platform Loyalty screens (stamp, program and printable join QR, activity) and the Manager's activity and program pages, on top of the Delivery A API.

**Architecture:** `apps/qr-card` is a public Next.js 16 app that talks only to itself: a route handler at `/loyalty-api/[...path]` forwards an allowlist of calls to the API's `/v1/loyalty/*`, **replacing** `X-Forwarded-For` with one client address and filtering cookies both ways. Pure logic (proxy, locale, poller, storage, join flow) lives in `apps/qr-card/lib` and is tested by the root `bun test apps`. Every React screen (card face, stamp, program, activity, print) lives in `packages/ui/src/loyalty/` and is tested there with happy-dom, the same way as the existing section pages. The apps' `page.tsx` files stay thin. One small API addition (a staff card lookup) and the `/api/me` loyalty flags come first in the staff half.

**Tech Stack:** Bun 1.3.2, Next.js `^16.3.8` (App Router, route handlers), React 19, Tailwind 4 with `@atrium/ui/theme.css`, Base UI through `@atrium/ui`, `qrcode.react` `^4.2.0` (already a dependency of `@atrium/ui`, no new package), the browser's `BarcodeDetector` (no library), `bun:test` + `@testing-library/react` + happy-dom (already in `@atrium/ui`), Hono in `apps/api`.

**Spec:** `docs/superpowers/specs/2026-10-19-crm-loyalty-qr-card-design.md` (section 2, "Settled during review", "Out of scope"). Also read `apps/docs/docs/adr/0022-loyalty-card-device-bound.md` and `apps/api/src/loyalty.ts` (Delivery A routes; a fix wave is touching that file, so locate code by function and route name, never by line).

## Global Constraints

- `qr-card` runs on port **3006** (`next dev --port 3006`, `next start --port 3006`). 3005 is the agents service.
- Public, no sign-in, **no CORS**: the browser calls `/loyalty-api/*` on the card app's own origin only.
- The card never asks for personal data to work and never shows guest data. The email is a separate optional step with an unchecked consent box.
- Brand: cream paper, ink outline, `packages/ui` tokens only. Program accent from the closed palette `lime`, `clay`, `charcoal`, `sage`; lime is the one highlight for a ready reward. Figures in the serif (`font-serif`), units in italic (`Emphasis`). No new fonts, no third-party requests.
- The card polls every **5 s** while visible and **30 s** while hidden, sends `If-None-Match` itself and keeps the last body in memory (the API answers `Cache-Control: no-store`, so the browser never revalidates for us).
- Card URL is `/c/<token>`; join URL is `/j/<joinToken>` (`jq1.<programId>.<version>.<sig>`). Every qr-card response: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`; card and join pages are dynamic and not cached.
- Device cookie `atr_card_dev` reaches the browser only with `Path=/loyalty-api`; no other API cookie passes the proxy.
- Idempotency keys are `crypto.randomUUID()` made in the browser, one per intended action, reused on retry of that same action.
- Void reason: 1 to 200 characters, with the hint "Do not write guest details (names, phone numbers or emails)."
- `403 {"error":"feature_locked","feature":"retention"}` from any staff route renders the existing locked module page (`ModulePage feature="retention"`). Public routes are never gated.
- Platform and Manager copy is English, as the rest of those apps. qr-card is English and Spanish, chosen from `Accept-Language` (fallback English).
- WCAG AA: every control reachable by keyboard with a visible focus ring; live regions for stamp results; `prefers-reduced-motion: reduce` turns the stamp animation off. The card is designed at 360 px wide first.
- Do **not** edit `.env.example` (the user has uncommitted edits there). Never `git add -A`; never stage `.env.example` or `.superpowers/`. Stage only the files a task lists.
- Biome (`bun run lint`), `bun run typecheck`, `bun run check:deps` and `bun run test` stay green after every task.

## Review Focus

1. **A double effect or double tap on `/j/<token>` posts the join twice**; the second answer is `409 device_limit` and the guest sees "you already got a card" for a card they just got. Expected: one POST per join token per page load. Test in Task 4 (`startJoin` twice → one fetch).
2. **Re-scanning the poster QR with a card already on the phone**. Expected: the stored card opens; no POST. Test in Task 4.
3. **A stamp retried after a timeout, or a double tap on "Add stamp"**. Expected: one stamp (the same key on retry; the button is busy while pending). Test in Task 7.
4. **Safari private mode or blocked storage, where `localStorage` throws**. Expected: join and card still work; only "saved cards" is empty. Test in Task 2.
5. **A 20-stamp program and a 120-character name on a 360 px phone**. Expected: 4 rows of 5 stamps, the name wraps, nothing scrolls sideways. Test in Task 3 (grid columns) and the Task 9 manual check.

---

## File structure

```
apps/qr-card/
  package.json  next.config.ts  tsconfig.json  postcss.config.mjs  next-env.d.ts  .gitignore
  app/layout.tsx  app/globals.css  app/page.tsx  app/saved-cards.tsx  app/not-found.tsx
  app/loyalty-api/[...path]/route.ts      thin: delegates to lib/proxy
  app/j/[joinToken]/page.tsx  join-app.tsx
  app/c/[token]/page.tsx      card-app.tsx
  lib/proxy.ts        clientIp, forwardLoyalty (pure, Web Request/Response)
  lib/headers.ts      the security header list next.config uses
  lib/locale.ts       pickLocale
  lib/poll.ts         fetchCard, delayFor, createCardPoller
  lib/use-card-poll.ts  React wrapper over createCardPoller
  lib/storage.ts      cardStore
  lib/join.ts         programIdOf, startJoin
  tests/proxy.test.ts headers.test.ts locale.test.ts poll.test.ts storage.test.ts join.test.ts
packages/ui/src/loyalty/
  accent.ts code.ts copy.ts keys.ts scanner.ts
  stamp-grid.tsx card-face.tsx email-opt-in.tsx card-screen.tsx
  program-page.tsx join-qr-panel.tsx print-page.tsx
  stamp-page.tsx activity-band.tsx activity-columns.tsx activity-page.tsx
  index.ts
packages/ui/tests/
  loyalty-card.test.tsx loyalty-program.test.tsx loyalty-stamp.test.tsx loyalty-activity.test.tsx loyalty-code.test.ts
apps/platform/app/(app)/loyalty/{stamp,activity,program}/page.tsx  apps/platform/app/print/loyalty/page.tsx
apps/manager/app/(app)/loyalty/{activity,program}/page.tsx         apps/manager/app/print/loyalty/page.tsx
```

---

### Task 1: The qr-card app shell and the same-origin proxy that overwrites X-Forwarded-For

**Files:**
- Create: `apps/qr-card/package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `next-env.d.ts`, `.gitignore` (copy the Hub's/Platform's), `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder heading, replaced in Task 4), `app/loyalty-api/[...path]/route.ts`, `lib/proxy.ts`, `lib/headers.ts`, `lib/locale.ts`
- Modify: `package.json` (root: add `apps/qr-card` to `check:deps`), `apps/api/src/loyalty.ts` (`clientIp`, `isHttps`), `apps/api/src/app.ts` (`AppDeps.loyaltyProxySecret`), `apps/api/src/server.ts` (read `LOYALTY_PROXY_SECRET`)
- Test: `apps/qr-card/tests/proxy.test.ts`, `apps/qr-card/tests/headers.test.ts`, `apps/qr-card/tests/locale.test.ts`, `apps/api/tests/loyalty.test.ts`

**Interfaces:**
- Consumes: API `POST /v1/loyalty/cards`, `GET /v1/loyalty/cards/:token`, `POST /v1/loyalty/cards/:token/email` (Delivery A).
- Produces:
  - `clientIp(headers: Headers, hops: number): string | null`
  - `forwardLoyalty(req: Request, path: string[], env: ProxyEnv): Promise<Response>` with `type ProxyEnv = { apiUrl: string; hops: number; proxySecret?: string; fetch?: typeof fetch }`
  - `SECURITY_HEADERS: { key: string; value: string }[]`
  - `type CardLocale = "en" | "es"` and `pickLocale(acceptLanguage: string | null): CardLocale` (in `lib/locale.ts`; Task 3 re-declares `CardLocale` in `packages/ui` with the same two values, since the package cannot import the app)
  - Browser path prefix `/loyalty-api/` and cookie path `/loyalty-api`.
  - API: `AppDeps.loyaltyProxySecret?: string`; header `x-atrium-proxy`.

**The decision this task carries.** Next keeps a client's `X-Forwarded-For` as it is and only fills it in when absent (`req.headers['x-forwarded-for'] ??= socket.remoteAddress` in Next's `base-server.js`), and a rewrite passes it on. So a rewrite cannot be safe. The card app uses a **route handler** that builds the upstream request itself:
- `QR_CARD_PROXY_HOPS` (default `0`) is the number of proxies you run in front of qr-card that append to `X-Forwarded-For`. With `hops >= 1`, the client address is the entry `hops` places from the right; it must pass `net.isIP`, otherwise `null`. With `0` the answer is always `null`. A route handler cannot see the socket, and Next cannot tell its own filled-in value from one the client wrote, so it fails closed: no `X-Forwarded-For` goes up, and the API falls back to the qr-card server's address. That is one shared bucket, which is fine for development and safe against spoofing.
- The upstream request carries **exactly one** `x-forwarded-for: <ip>` (or none when `null`), plus `x-atrium-proxy: <LOYALTY_PROXY_SECRET>` when configured. Every incoming `forwarded`, `x-forwarded-*`, `x-real-ip` and `x-atrium-proxy` header is dropped. `x-forwarded-proto` is sent only when `hops >= 1`, copied from the incoming first value.
- The API trusts `X-Forwarded-For` (and `X-Forwarded-Proto`) only when `TRUST_PROXY=1` **and**, if `LOYALTY_PROXY_SECRET` is set, `x-atrium-proxy` matches it (compared with `timingSafeEqual` over equal-length buffers). The API is public for connectors, so without the secret anyone calling the API directly could choose their own address. Production sets all three: `TRUST_PROXY=1`, the same `LOYALTY_PROXY_SECRET` on API and qr-card, and the right `QR_CARD_PROXY_HOPS`. Without `TRUST_PROXY` every guest shares the qr-card server's address, which means one bucket of 20 joins an hour for everybody.

- [ ] **Step 1: Write the failing proxy tests** in `apps/qr-card/tests/proxy.test.ts` (a fake `fetch` records the upstream `Request`; it returns `new Response(JSON.stringify({token:"t".repeat(22),shortCode:"ABCD-EFGH"}),{status:201,headers:{"content-type":"application/json","set-cookie":"atr_card_dev=11111111-1111-4111-8111-111111111111; Path=/; HttpOnly; SameSite=Lax"}})` unless a test says otherwise)

```ts
const env = { apiUrl: "http://api.test", hops: 1, proxySecret: "p".repeat(32), fetch: fake };
test("clientIp takes the entry `hops` from the right and ignores what the client wrote", () => {
  expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1)).toBe("203.0.113.9");
  expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }), 2)).toBe("203.0.113.9");
  expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.4" }), 0)).toBeNull(); // no trusted hop: fail closed
  expect(clientIp(new Headers({ "x-forwarded-for": "not-an-ip" }), 1)).toBeNull();
  expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }), 3)).toBeNull();
  expect(clientIp(new Headers(), 0)).toBeNull();
});
test("the upstream request has exactly one X-Forwarded-For, the proxy secret, and no spoofed forwarding headers", async () => {
  await forwardLoyalty(post("/loyalty-api/cards", { "x-forwarded-for": "6.6.6.6, 203.0.113.9",
    "x-real-ip": "6.6.6.6", forwarded: "for=6.6.6.6", "x-atrium-proxy": "forged" }), ["cards"], env);
  const sent = fake.last();
  expect(sent.url).toBe("http://api.test/v1/loyalty/cards");
  expect(sent.headers.get("x-forwarded-for")).toBe("203.0.113.9");
  expect(sent.headers.get("x-atrium-proxy")).toBe("p".repeat(32));
  expect(sent.headers.get("x-real-ip")).toBeNull();
  expect(sent.headers.get("forwarded")).toBeNull();
});
test("only the device cookie goes up, and it comes back on /loyalty-api only", async () => {
  const res = await forwardLoyalty(post("/loyalty-api/cards", { cookie: "atr_card_dev=abc; atr_session=s; other=1" }), ["cards"], env);
  expect(fake.last().headers.get("cookie")).toBe("atr_card_dev=abc");
  const set = res.headers.getSetCookie();
  expect(set).toHaveLength(1);
  expect(set[0]).toContain("atr_card_dev=");
  expect(set[0]).toContain("Path=/loyalty-api");
  expect(set[0]).not.toContain("Path=/;");
});
test("a Set-Cookie for any other name is dropped", async () => { /* upstream sends atr_session=x; Path=/ → getSetCookie() is [] */ });
test("ETag and If-None-Match pass through; a 304 has no body", async () => {
  // upstream answers 304 with ETag "\"e1\""; request sent If-None-Match "\"e1\""
  expect(fake.last().headers.get("if-none-match")).toBe('"e1"');
  expect(res.status).toBe(304);
  expect(res.headers.get("etag")).toBe('"e1"');
  expect(await res.text()).toBe("");
});
test("responses are no-store, keep Retry-After, and carry no CORS header", async () => {
  // upstream 429 with Retry-After: 120 and Access-Control-Allow-Origin: *
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("retry-after")).toBe("120");
  expect(res.headers.get("access-control-allow-origin")).toBeNull();
});
test("only the three card routes are forwarded", async () => {
  for (const [method, path] of [["GET", ["cards"]], ["POST", ["programs"]], ["GET", ["cards", "short"]],
    ["GET", ["cards", "t".repeat(22), "email"]], ["POST", ["cards", "..", "x"]]] as const) {
    const res = await forwardLoyalty(new Request(`http://card.test/x`, { method }), [...path], env);
    expect([404, 405]).toContain(res.status);
  }
  expect(fake.calls).toBe(0);
});
test("a body over 8 KiB is 413 without an upstream call", async () => { /* 9000-byte body → 413, fake.calls 0 */ });
test("an API that does not answer is 502 unavailable", async () => { /* fetch rejects → 502 {error:"unavailable"} */ });
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/qr-card/tests/proxy.test.ts`
Expected: FAIL, cannot find `../lib/proxy`.

- [ ] **Step 3: Implement `lib/proxy.ts`**

`clientIp(headers, hops)` as decided above. `forwardLoyalty(req, path, env)`:
- Routes: `POST ["cards"]`; `GET ["cards", token]`; `POST ["cards", token, "email"]`, where `token` matches `/^[A-Za-z0-9_-]{22}$/` (the API's `looksLikeCardToken`). A known shape with the wrong method → `405`; anything else → `404 {"error":"not_found"}`. No upstream call either way.
- Request headers kept: `content-type`, `accept`, `accept-language`, `if-none-match`, and `cookie` reduced to the `atr_card_dev=` pair. Then add the forwarding headers as decided.
- Body: `await req.arrayBuffer()` for POST; over `8 * 1024` bytes → `413 {"error":"payload_too_large"}`.
- Upstream: `(env.fetch ?? fetch)(`${env.apiUrl}/v1/loyalty/${path.map(encodeURIComponent).join("/")}`, { method, headers, body, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) })`. A rejection → `502 {"error":"unavailable"}`.
- Response headers kept: `content-type`, `etag`, `retry-after`. Then `set-cookie` entries named `atr_card_dev` only, with `Path=<anything>` replaced by `Path=/loyalty-api`, and `cache-control: no-store`. Status passed through; `204` and `304` have a `null` body.

`app/loyalty-api/[...path]/route.ts`: `export const dynamic = "force-dynamic"`, `export const runtime = "nodejs"`. `GET` and `POST` take `(req: Request, ctx: { params: Promise<{ path: string[] }> })` and call `forwardLoyalty` with `{ apiUrl: process.env.API_URL ?? "http://localhost:3001", hops: Number(process.env.QR_CARD_PROXY_HOPS ?? 0) || 0, proxySecret: process.env.LOYALTY_PROXY_SECRET || undefined }`. Nothing is logged.

- [ ] **Step 4: Run the proxy tests**

Run: `bun test apps/qr-card/tests/proxy.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing header and locale tests**

```ts
// headers.test.ts
test("every path gets no-referrer, noindex, nosniff, no framing and no camera", async () => {
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/:path*")!;
  const get = (k: string) => all.headers.find((h) => h.key === k)?.value;
  expect(get("Referrer-Policy")).toBe("no-referrer");
  expect(get("X-Robots-Tag")).toBe("noindex, nofollow");
  expect(get("X-Content-Type-Options")).toBe("nosniff");
  expect(get("X-Frame-Options")).toBe("DENY");
  expect(get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  expect(get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
});
test("there are no rewrites: the API is reached only through the route handler", async () => {
  expect(config.rewrites).toBeUndefined();
});
// locale.test.ts
test("pickLocale follows the q-values and falls back to English", () => {
  expect(pickLocale("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
  expect(pickLocale("en-GB,es;q=0.5")).toBe("en");
  expect(pickLocale("fr-FR,es;q=0.3,en;q=0.2")).toBe("es");
  expect(pickLocale("de")).toBe("en");
  expect(pickLocale(null)).toBe("en");
  expect(pickLocale("es;q=0")).toBe("en");
});
```

- [ ] **Step 6: Implement the shell**

- `package.json`: `"name": "@atrium/qr-card"`, scripts `dev: next dev --port 3006`, `build: next build`, `start: next start --port 3006`. Same dependencies and devDependencies as `apps/hub/package.json`.
- `next.config.ts`: `agentRules: false`, `transpilePackages: ["@atrium/ui"]`, `poweredByHeader: false`, and `headers()` returning `[{ source: "/:path*", headers: SECURITY_HEADERS }]`. `SECURITY_HEADERS` comes from `lib/headers.ts`. No `rewrites`.
- `app/layout.tsx`: `<html lang={pickLocale((await headers()).get("accept-language"))}>`. `metadata = { title: "Atrium card", robots: { index: false, follow: false }, referrer: "no-referrer" }`. `viewport = { width: "device-width", initialScale: 1, themeColor: <the hex of --cream-100 in packages/ui/src/tokens.css> }`. No web manifest. A manifest's `start_url` would open a home-screen icon on a page without the token, and on iOS a home-screen app has its own storage, so the card would be lost. Without a manifest the icon opens the `/c/<token>` URL it was added from.
- `app/globals.css`: the same two lines as the Hub's.
- `lib/locale.ts`: `pickLocale` parses `Accept-Language` entries, takes the primary subtag, drops `q=0`, sorts by q (stable), and returns the first of `es` and `en`. Otherwise `"en"`.
- Root `package.json` `check:deps`: add `apps/qr-card` after `apps/hub`.

- [ ] **Step 7: Write the failing API test** in `apps/api/tests/loyalty.test.ts`, next to the existing "a join is limited per IP, and X-Forwarded-For counts only behind a trusted proxy"

```ts
test("with LOYALTY_PROXY_SECRET, X-Forwarded-For counts only when x-atrium-proxy matches", async () => {
  // app built with trustProxy: true, loyaltyProxySecret: "q".repeat(32)
  // 20 joins with different X-Forwarded-For values and no x-atrium-proxy, then a 21st → 429 (one bucket: the socket's)
  // 21 joins with different X-Forwarded-For values and x-atrium-proxy: "q".repeat(32) → none is 429
  // a wrong x-atrium-proxy value counts as no header (the 21st is 429)
});
```

- [ ] **Step 8: Implement the API gate**

In `apps/api/src/loyalty.ts`, add a helper `trustsForwarding(c: Context, trustProxy: boolean, proxySecret?: string): boolean` that holds the rule decided above. Use it in place of the bare `trustProxy` inside `clientIp` and `isHttps`. Pass `deps.loyaltyProxySecret` through `mountLoyaltyPublic`. In `app.ts`, add `loyaltyProxySecret?: string` to `AppDeps` with a doc comment. In `server.ts`, read `process.env.LOYALTY_PROXY_SECRET`, pass it on when it is 32 characters or more, and log one warning (`loyalty.proxy_secret_missing`) when `TRUST_PROXY` is on without it.

- [ ] **Step 9: Run everything for this task**

Run: `bun install && bun test apps/qr-card apps/api/tests/loyalty.test.ts && bun run lint && bun run typecheck && bun run check:deps && bun run --filter @atrium/qr-card build`
Expected: all PASS, and `next build` lists `ƒ /loyalty-api/[...path]`.

- [ ] **Step 10: Commit**

```bash
git add apps/qr-card package.json bun.lock apps/api/src/loyalty.ts apps/api/src/app.ts apps/api/src/server.ts apps/api/tests/loyalty.test.ts
git commit -m "feat(qr-card): the card app shell and a same-origin proxy that overwrites X-Forwarded-For" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The card's data layer: poll with ETag, back off, remember cards

**Files:**
- Create: `apps/qr-card/lib/poll.ts`, `apps/qr-card/lib/use-card-poll.ts`, `apps/qr-card/lib/storage.ts`
- Test: `apps/qr-card/tests/poll.test.ts`, `apps/qr-card/tests/storage.test.ts`

**Interfaces:**
- Consumes: `/loyalty-api/cards/<token>` (Task 1). The body is Delivery A's `CardView`.
- Produces:
  - `type CardView = { state: "active" | "paused" | "closed"; locationName: string; programName: string; rewardLabel: string; accent: "lime" | "clay" | "charcoal" | "sage"; stampsRequired: number; stampsInCycle: number; rewardReady: boolean; shortCode: string; etag: string }` (exported from `lib/poll.ts`; Task 3 has the same shape as `LoyaltyCardView` in `@atrium/ui`)
  - `type PollResult = { kind: "ok"; view: CardView; etag: string | null } | { kind: "not_modified" } | { kind: "not_found" } | { kind: "rate_limited"; retryAfter: number } | { kind: "error" }`
  - `fetchCard(token: string, etag: string | null, fetchFn?: typeof fetch): Promise<PollResult>`
  - `delayFor(visible: boolean, result: PollResult, failures: number): number | null` (`null` = stop)
  - `createCardPoller(opts: { token: string; fetchFn?: typeof fetch; schedule?: (fn: () => void, ms: number) => () => void; isVisible: () => boolean; onView: (view: CardView) => void; onStatus: (s: CardStatus) => void }): { start(): void; stop(): void; visibilityChanged(): void; refresh(): void }`
  - `type CardStatus = "loading" | "live" | "offline" | "not_found" | "rate_limited"`
  - `useCardPoll(token: string): { view: CardView | null; status: CardStatus; refresh: () => void }`
  - `cardStore(storage: StorageLike | null): { save(programId: string, token: string): void; load(programId: string): string | null; forget(programId: string): void; list(): { programId: string; token: string }[]; emailDone(shortCode: string): boolean; markEmailDone(shortCode: string): void; hintDismissed(): boolean; dismissHint(): void }` with `type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">`. Keys: `atr_card:<programId>`, `atr_card_email:<shortCode>`, `atr_card_hint`.

- [ ] **Step 1: Write the failing tests**

```ts
// poll.test.ts (fake fetch returns queued Responses; fake schedule records [ms] and lets the test run the callback)
test("fetchCard sends If-None-Match itself, with no-store, and reads the ETag", async () => {
  const r = await fetchCard("t".repeat(22), '"e1"', fake);
  expect(fake.last().url).toBe("/loyalty-api/cards/" + "t".repeat(22));
  expect(fake.last().headers.get("if-none-match")).toBe('"e1"');
  expect(fake.lastInit().cache).toBe("no-store");
});
test("304 is not_modified, 404 not_found, 429 rate_limited with Retry-After seconds, a throw or 5xx error", async () => {});
test("delayFor: 5 s visible, 30 s hidden, Retry-After when limited, doubling up to 60 s on errors, stop on not_found", () => {
  const ok = { kind: "not_modified" } as const;
  expect(delayFor(true, ok, 0)).toBe(5_000);
  expect(delayFor(false, ok, 0)).toBe(30_000);
  expect(delayFor(true, { kind: "rate_limited", retryAfter: 90 }, 0)).toBe(90_000);
  expect(delayFor(true, { kind: "error" }, 1)).toBe(10_000);
  expect(delayFor(true, { kind: "error" }, 9)).toBe(60_000);
  expect(delayFor(true, { kind: "not_found" }, 0)).toBeNull();
});
test("the stamp arrives: onView fires for 3, not for the 304, then for 4", async () => {
  // queue: 200 {stampsInCycle:3, etag:"a"} ETag "a"; 304; 200 {stampsInCycle:4} ETag "b"
  expect(views.map((v) => v.stampsInCycle)).toEqual([3, 4]);
  expect(sentEtags).toEqual([null, '"a"', '"a"']);
});
test("a closed card stops polling; a paused one keeps the normal cadence", async () => {});
test("becoming visible fetches at once and cancels the 30 s wait", async () => {});
test("an error after a good view keeps the view and says offline; the next 200 says live", async () => {});
test("stop() cancels the pending timer and ignores an answer that lands later", async () => {});
// storage.test.ts
test("save, load, list and forget a card by program", () => {});
test("Review Focus 4: a storage that throws on every call, or null, never throws", () => {
  const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); },
    removeItem() { throw new Error("x"); }, key() { throw new Error("x"); }, get length(): number { throw new Error("x"); } };
  for (const s of [broken, null]) {
    const store = cardStore(s as never);
    expect(() => store.save("p", "t")).not.toThrow();
    expect(store.load("p")).toBeNull();
    expect(store.list()).toEqual([]);
    expect(store.emailDone("ABCD-EFGH")).toBe(false);
  }
});
test("list ignores keys that are not cards and values that are not card tokens", () => {});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/qr-card/tests/poll.test.ts apps/qr-card/tests/storage.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `fetchCard`, `delayFor` and `createCardPoller` in `lib/poll.ts`, and `cardStore` in `lib/storage.ts`, with the signatures above. The poller keeps `etag`, the last view and a failure count in a closure, and always has at most one timer and one request in flight (a `refresh()` during a request waits for it). A view counts as changed only on a `200`. `useCardPoll` creates the poller in an effect, wires `document.visibilityState` and `visibilitychange`, and stops on unmount. Default `schedule` is `setTimeout`/`clearTimeout`. `cardStore` wraps each storage call in `try/catch` and keeps a card token only if it matches `/^[A-Za-z0-9_-]{22}$/`.

- [ ] **Step 4: Run them to see them pass**

Run: `bun test apps/qr-card/tests && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/qr-card/lib/poll.ts apps/qr-card/lib/use-card-poll.ts apps/qr-card/lib/storage.ts apps/qr-card/tests/poll.test.ts apps/qr-card/tests/storage.test.ts
git commit -m "feat(qr-card): poll the card with its own ETag, back off on limits, keep cards on the device" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The card face and the guest's screen in `@atrium/ui`

**Files:**
- Create: `packages/ui/src/loyalty/accent.ts`, `code.ts`, `copy.ts`, `stamp-grid.tsx`, `card-face.tsx`, `email-opt-in.tsx`, `card-screen.tsx`, `index.ts`
- Modify: `packages/ui/src/index.ts` (`export * from "./loyalty"`)
- Test: `packages/ui/tests/loyalty-card.test.tsx`, `packages/ui/tests/loyalty-code.test.ts`

**Interfaces:**
- Consumes: the `CardView` shape (Task 2), `QRCodeSVG` from `qrcode.react`, `Emphasis`, `Highlight`, `Wordmark`, `Banner`, `Button`, `TextField`, `Checkbox`, `Skeleton`, `Card`.
- Produces:
  - `type LoyaltyAccent = "lime" | "clay" | "charcoal" | "sage"`, `LOYALTY_ACCENTS: readonly LoyaltyAccent[]`, `ACCENT_STYLE: Record<LoyaltyAccent, { fill: string; ink: string; label: string }>`. Classes: lime `bg-lime-500`/`text-charcoal-900`; clay `bg-clay-500`/`text-cream-100`; charcoal `bg-charcoal-800`/`text-cream-100`; sage `bg-sage-500`/`text-cream-100`. Labels `Lime`, `Clay`, `Charcoal`, `Sage`.
  - `normalizeCardCode(input: string): string | null`, `formatCardCode(code: string): string`, `parseScannedCode(raw: string): string | null`. Alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, 8 characters. This is a deliberate copy of `modules/crm/domain/tokens.ts`, because `packages/ui` cannot import a module. Format `XXXX-XXXX`.
  - `type LoyaltyCardView` (the `CardView` shape), `type CardLocale = "en" | "es"`, `type CardCopy` (keys in the table below), `CARD_COPY: Record<CardLocale, CardCopy>`, `fill(template: string, vars: Record<string, string | number>): string`.
  - `StampGrid({ required, filled, accent, animateIndex?, label }: { required: number; filled: number; accent: LoyaltyAccent; animateIndex?: number | null; label: string })`
  - `LoyaltyCardFace({ view, copy, animateIndex? })`: the venue, the grid, the progress line and the reward. Task 6 reuses it as the preview.
  - `EmailOptIn({ venue, copy, onSubmit, done }: { venue: string; copy: CardCopy; onSubmit: (email: string) => Promise<"ok" | "invalid_email" | "unavailable" | "rate_limited">; done: boolean })`
  - `LoyaltyCardScreen(props: { status: "loading" | "live" | "offline" | "not_found" | "rate_limited"; view: LoyaltyCardView | null; copy: CardCopy; onEmail: EmailOptIn["onSubmit"]; emailDone: boolean; showHint: boolean; onDismissHint: () => void; announce?: string | null; animateIndex?: number | null })`
  - `JoinStateScreen({ title, body }: { title: string; body: string })`: a plain centred state card, used for every non-card state in Task 4.

**Layout (360 px first, centred, `max-w-sm`):** the venue name on top in the serif, size 32 px, wrapping, with the program name under it in caps. Then the card: a `Card` with an ink border and the grid. Under it the progress line, `<serif>3</serif> <em>of</em> 8 <em>stamps</em>`, and the reward line. When `rewardReady`, a `Highlight` (lime) block holds the ready title and body and the grid is shown full. Then the short code in the serif at 40 px with `tabular-nums tracking-wider`, labelled, next to a `QRCodeSVG` of the **formatted short code** (size 120, `fgColor="currentColor"`, `bgColor="transparent"`). The card QR holds the short code, never the card token: the token is a bearer secret and the staff screen looks a card up by place and code anyway. Then the home-screen hint (dismissible), then `EmailOptIn` with the "Optional" note. The grid has `required <= 5 ? required : Math.min(5, Math.ceil(required / 2))` columns. Each stamp is a CSS circle, 1px ink border, `aspect-square`: filled stamps take the accent fill and an ink `Check` icon; empty ones a dashed border. `animateIndex` gets a 300 ms scale-in under `motion-safe:` only. The grid has `role="img"` and `aria-label={label}`. A polite live region (`role="status"`) reads `announce`.

**Copy (exact):**

| Key | EN | ES |
| --- | --- | --- |
| loading | Loading your card… | Cargando tu tarjeta… |
| progress | {n} of {total} stamps | {n} de {total} sellos |
| reward | Reward: {reward} | Premio: {reward} |
| toGoOne / toGo | 1 more to your reward / {k} more to your reward | Te falta 1 para tu premio / Te faltan {k} para tu premio |
| readyTitle / readyBody | Your reward is ready / Show this card to the staff to redeem {reward}. | Tu premio está listo / Enseña esta tarjeta al personal para canjear {reward}. |
| codeLabel / codeHint | Your card code / Show this code or the QR to the staff when you pay. | Código de tu tarjeta / Enseña este código o el QR al personal al pagar. |
| stampAdded | Stamp added. {n} of {total}. | Sello añadido. {n} de {total}. |
| pausedTitle / pausedBody | This card is paused / The venue has paused its card for now. Your stamps are kept. | Esta tarjeta está en pausa / El local ha pausado su tarjeta por ahora. Tus sellos se conservan. |
| closedTitle / closedBody | This card is closed / It can no longer collect stamps. Ask at the venue for a new one. | Esta tarjeta está cerrada / Ya no puede sumar sellos. Pide una nueva en el local. |
| notFoundTitle / notFoundBody | We could not find this card / Scan the QR at the venue to get a new one. | No encontramos esta tarjeta / Escanea el QR del local para conseguir una nueva. |
| invalidTitle / invalidBody | This QR no longer works / Ask the staff for the current one. | Este QR ya no funciona / Pide al personal el actual. |
| deviceTitle / deviceBody | You already got a card here today / Open it from this phone's browser, or try again tomorrow. | Ya conseguiste una tarjeta aquí hoy / Ábrela desde el navegador de este móvil, o vuelve a intentarlo mañana. |
| limitedTitle / limitedBody | Too many tries / Wait a few minutes and try again. | Demasiados intentos / Espera unos minutos y vuelve a intentarlo. |
| offline | No connection. Showing your card as it was. | Sin conexión. Mostramos tu tarjeta como estaba. |
| joining | Getting your card… | Preparando tu tarjeta… |
| hint / hintDismiss | Add this page to your home screen to open your card in one tap. / Got it | Añade esta página a tu pantalla de inicio para abrir tu tarjeta con un toque. / Entendido |
| emailTitle / emailOptional | Tell me about my rewards / Optional. Your card works without it. | Avísame de mis premios / Opcional. Tu tarjeta funciona sin esto. |
| emailLabel / consent | Email / I agree to receive emails from {venue} about my card and its offers. | Correo electrónico / Acepto recibir correos de {venue} sobre mi tarjeta y sus ofertas. |
| unsubscribe | Every email has a link to unsubscribe in one click. | Cada correo trae un enlace para darte de baja con un clic. |
| emailSubmit / emailDone | Keep me posted / Done. We will write to you about your rewards. | Avisadme / Listo. Te escribiremos sobre tus premios. |
| emailInvalid / emailUnavailable | Check the email address. / We could not link it this time. | Revisa el correo. / No hemos podido vincularlo esta vez. |
| savedTitle / savedNone / savedOpen | Your cards / Scan the QR at a venue to get a card. / Open card | Tus tarjetas / Escanea el QR de un local para conseguir una tarjeta. / Abrir tarjeta |

- [ ] **Step 1: Write the failing tests**

```tsx
// loyalty-code.test.ts
test("normalize, format and parse a scanned code", () => {
  expect(normalizeCardCode("abcd-efgh")).toBe("ABCDEFGH");
  expect(normalizeCardCode("ABCD EFG0")).toBeNull();          // 0 is not in the alphabet
  expect(formatCardCode("ABCDEFGH")).toBe("ABCD-EFGH");
  expect(parseScannedCode("  abcd-efgh\n")).toBe("ABCDEFGH");
  expect(parseScannedCode("https://evil.test/ABCDEFGH")).toBeNull();
});
// loyalty-card.test.tsx
const view = { state: "active", locationName: "Casa Olivo", programName: "Coffee card", rewardLabel: "A free coffee",
  accent: "clay", stampsRequired: 8, stampsInCycle: 3, rewardReady: false, shortCode: "ABCD-EFGH", etag: "e" } as const;
test("an active card: 8 cells, 3 filled in the accent, progress, reward, code, and a QR of the code", () => {
  setup(<LoyaltyCardScreen status="live" view={view} copy={CARD_COPY.en} onEmail={ok} emailDone={false} showHint onDismissHint={noop} />);
  expect(screen.getByRole("img", { name: "3 of 8 stamps" })).toBeTruthy();
  expect(document.querySelectorAll("[data-stamp]")).toHaveLength(8);
  expect(document.querySelectorAll('[data-stamp="filled"].bg-clay-500')).toHaveLength(3);
  expect(screen.getByText("Reward: A free coffee")).toBeTruthy();
  expect(screen.getByText("5 more to your reward")).toBeTruthy();
  expect(screen.getByText("ABCD-EFGH")).toBeTruthy();
  expect(document.querySelector("svg[data-card-qr]")).toBeTruthy();
});
test("Review Focus 5: 20 stamps are 4 rows of 5", () => { /* grid has class grid-cols-5 and 20 cells */ });
test("a ready reward shows the lime highlight with the reward and every stamp filled", () => {});
test("paused and closed show their copy and no email box; not_found shows its copy", () => {});
test("offline keeps the last card and shows the offline line", () => {});
test("Spanish copy: 3 de 8 sellos", () => {});
test("the email box: submit is refused until the consent box is ticked; done replaces the form", async () => {
  // type an address, click submit with consent unticked → onEmail not called and the consent checkbox is invalid
  // tick, submit → onEmail("guest@example.com"); resolves "ok" → the done copy appears in a status region
});
test("invalid_email and unavailable show their copy and keep the form", async () => {});
test("the announce text is in a polite live region; the animation class is motion-safe only", () => {});
test("no guest data: the screen never renders an email once done", async () => {});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/ui && bun test tests/loyalty-card.test.tsx tests/loyalty-code.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the files** with the signatures, layout and copy above. Add `data-stamp="filled|empty"` on cells and `data-card-qr` on the QR svg.

- [ ] **Step 4: Run the tests**

Run: `cd packages/ui && bun test && cd ../.. && bun run lint && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/loyalty packages/ui/src/index.ts packages/ui/tests/loyalty-card.test.tsx packages/ui/tests/loyalty-code.test.ts
git commit -m "feat(ui): the stamp card face and the guest's card screen, in English and Spanish" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The join page, the card page and the saved cards

**Files:**
- Create: `apps/qr-card/lib/join.ts`, `app/j/[joinToken]/page.tsx`, `app/j/[joinToken]/join-app.tsx`, `app/c/[token]/page.tsx`, `app/c/[token]/card-app.tsx`, `app/saved-cards.tsx`, `app/not-found.tsx`
- Modify: `apps/qr-card/app/page.tsx`
- Test: `apps/qr-card/tests/join.test.ts`

**Interfaces:**
- Consumes: `cardStore`, `useCardPoll`, `fetchCard` (Task 2); `pickLocale` (Task 1); `LoyaltyCardScreen`, `JoinStateScreen`, `CARD_COPY`, `fill` (Task 3).
- Produces:
  - `programIdOf(joinToken: string): string | null` (`jq1.<uuid>.<int>.<sig>` → the uuid, else `null`)
  - `type JoinOutcome = { kind: "card"; token: string } | { kind: "invalid" } | { kind: "paused" } | { kind: "device_limit" } | { kind: "rate_limited"; retryAfter: number } | { kind: "error" }`
  - `startJoin(joinToken: string, deps: { fetchFn?: typeof fetch; store: ReturnType<typeof cardStore> }): Promise<JoinOutcome>`. In-flight calls are kept in a module-level `Map<string, Promise<JoinOutcome>>`, so a second call with the same token gets the same promise.

**Flow (decided here).** `/j/<joinToken>` is a dynamic server page. It reads the locale and renders `JoinApp`, which shows `joining` and calls `startJoin` once in an effect:
1. `programIdOf` is `null` → `invalid`, no request.
2. A stored token for that program → `fetchCard(token, null)`. A `200` → `card` (no POST). A `404` → `store.forget(programId)` and go on.
3. `POST /loyalty-api/cards {joinToken}`. `201` → `store.save(programId, token)` → `card`. `410` with `error: "paused"` → `paused`; other `410` → `invalid`; `409` → `device_limit`; `429` → `rate_limited` with `Retry-After`; anything else → `error`.

On `card`, `JoinApp` calls `window.location.replace("/c/" + token)`, so `/j/` stays out of history. The other outcomes render `JoinStateScreen` with the matching copy.

The token stays in the `/c/<token>` path because a home-screen shortcut must carry it (see Task 1). Its exposure is bounded by `no-referrer`, `no-store`, `noindex`, no third-party requests and no logging in the proxy.

`/c/<token>` is a dynamic server page that passes `token` and `locale` to `CardApp`. `CardApp` uses `useCardPoll(token)`. When `stampsInCycle` goes up (or `rewardReady` turns true) from one live view to the next, it sets `announce` to `stampAdded` (or `readyTitle`) and `animateIndex` to the new stamp. `onEmail` posts `/loyalty-api/cards/<token>/email {email, consent: true}`: `204` → `ok` and `store.markEmailDone(shortCode)`; `400 invalid_email` → `invalid_email`; `404` → `unavailable`; `429` → `rate_limited`. The hint is hidden when `matchMedia("(display-mode: standalone)")` matches or `store.hintDismissed()`.

`/` renders `SavedCards`: `store.list()` as links to `/c/<token>` labelled `savedOpen`, or `savedNone`. A token that answers 404 is shown as not found and forgotten. `not-found.tsx` uses `notFoundTitle`/`notFoundBody`. Pages export `dynamic = "force-dynamic"`.

- [ ] **Step 1: Write the failing tests** in `apps/qr-card/tests/join.test.ts` (Map-backed `StorageLike`; fake fetch with queued answers)

```ts
const JT = "jq1.11111111-1111-4111-8111-111111111111.1.sig";
test("programIdOf reads the program from a join token and refuses anything else", () => {
  expect(programIdOf(JT)).toBe("11111111-1111-4111-8111-111111111111");
  expect(programIdOf("qr1.x.1.sig")).toBeNull();
  expect(programIdOf("jq1.not-a-uuid.1.sig")).toBeNull();
});
test("201 saves the card for the program and returns it", async () => {
  expect(await startJoin(JT, deps)).toEqual({ kind: "card", token: "t".repeat(22) });
  expect(store.load("11111111-1111-4111-8111-111111111111")).toBe("t".repeat(22));
  expect(JSON.parse(await fake.last().text())).toEqual({ joinToken: JT });
});
test("Review Focus 1: two calls at once post once", async () => {
  const [a, b] = await Promise.all([startJoin(JT, deps), startJoin(JT, deps)]);
  expect(a).toEqual(b);
  expect(fake.posts).toBe(1);
});
test("Review Focus 2: a stored card that still answers opens without a POST", async () => {
  store.save("11111111-1111-4111-8111-111111111111", "s".repeat(22));
  expect(await startJoin(JT, deps)).toEqual({ kind: "card", token: "s".repeat(22) });
  expect(fake.posts).toBe(0);
});
test("a stored card that is gone is forgotten and a new one is issued", async () => {});
test("410 paused, 410 invalid, 409 device_limit, 429 with Retry-After, 502 error", async () => {});
test("a malformed join token makes no request", async () => {});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/qr-card/tests/join.test.ts`
Expected: FAIL, `../lib/join` not found.

- [ ] **Step 3: Implement `lib/join.ts` and the pages** as decided above.

- [ ] **Step 4: Run the tests, the build and a smoke run against the real API**

Run: `bun test apps/qr-card && bun run typecheck && bun run --filter @atrium/qr-card build`
Expected: PASS; the build lists `ƒ /c/[token]`, `ƒ /j/[joinToken]`, `ƒ /loyalty-api/[...path]`.

Smoke (three terminals; the same `LOYALTY_SECRET` for the seed and the API, because `.env.local` has none):
```bash
export LOYALTY_SECRET=dev-loyalty-secret-0123456789abcdef0123
bun --env-file=.env.local run seed:loyalty                      # prints join URLs http://localhost:3006/j/jq1.…
bun --env-file=.env.local run --filter @atrium/api dev           # :3001
bun --env-file=.env.local run --filter @atrium/qr-card dev       # :3006
curl -si -X POST localhost:3006/loyalty-api/cards -H 'content-type: application/json' -d '{"joinToken":"<printed token>"}'
```
Expected: `201`, a body with `token` and `shortCode`, `Set-Cookie: atr_card_dev=…; Path=/loyalty-api; HttpOnly; SameSite=Lax`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. Then `curl -si localhost:3006/loyalty-api/cards/<token>` gives `200` with an `ETag`, and repeating it with `-H 'If-None-Match: <etag>'` gives `304`.

- [ ] **Step 5: Commit**

```bash
git add apps/qr-card/lib/join.ts apps/qr-card/app apps/qr-card/tests/join.test.ts
git commit -m "feat(qr-card): join once from the printed QR, show the live card, list the cards on this phone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Staff plumbing: a card lookup route, the loyalty flags on /me, the client API and the menus

**Files:**
- Modify: `modules/crm/application/activity.ts` (add `StaffCard`, `lookupCard`), `modules/crm/index.ts`, `apps/api/src/loyalty.ts` (a `GET /loyalty/card` route inside `mountLoyalty`, next to `/loyalty/program`), `apps/api/src/cases.ts` (`/me`), `packages/ui/src/api.ts`, `packages/ui/src/shell/nav.ts`, `packages/ui/tests/fake-api.ts` (`meOf` gains the four flags as `false`)
- Test: `modules/crm/tests/lookup.test.ts` (setup copied from `email-activity.test.ts`), `apps/api/tests/loyalty.test.ts`, `packages/ui/tests/nav.test.ts`, `packages/ui/tests/loyalty-api.test.ts`

**Interfaces:**
- Consumes: Delivery A `LoyaltyCardProgress`, `ActivityRow`, `CardNotFoundError`, `locationVisible`, `listCardEvents`.
- Produces:
  - `type StaffCard = LoyaltyCardProgress & { cardId: string; accent: Accent; recent: ActivityRow[] }` (the last 5 events of the card, newest first by `(created_at, seq)`; a void row carries its note)
  - `lookupCard(tx: Tx, scope: Scope, input: { locationId: string; code: string }): Promise<StaffCard>`. It needs `loyalty:read` (else `LoyaltyForbiddenError`). It throws `CardNotFoundError` for a malformed code, an unknown code, or a place outside the scope, so the caller cannot tell them apart.
  - `GET /api/loyalty/card?locationId=<uuid>&code=<string ≤ 20>` → `200 { card: StaffCard }`, `404 not_found`, `422 invalid_id | invalid_request`, behind `guarded("read")` (so `feature_locked` applies).
  - `/api/me` gains `canReadLoyalty`, `canStampLoyalty`, `canRedeemLoyalty`, `canManageLoyalty` (`can(scope.role, "loyalty", …)`); so does `Me` in `packages/ui/src/api.ts`.
  - In `packages/ui/src/api.ts`: `ApiError` gains a third constructor field, `readonly detail: Record<string, unknown> = {}`, set by `call` to the parsed body. Types: `LoyaltyProgram` (the Delivery A `Program` shape), `LoyaltyProgramInput = { name: string; stampsRequired: number; rewardLabel: string; cooldownMinutes: number; active: boolean; accent: LoyaltyAccent }`, `StaffCard`, `LoyaltyStampResult = { cardId: string; stampsInCycle: number; stampsRequired: number; rewardEarned: boolean; rewardReady: boolean }`, `LoyaltyActivityRow` (`ActivityRow`), `LoyaltyKind = "stamp" | "reward_earned" | "reward_redeemed" | "void"`, `LoyaltyActivityQuery = { range: RangeKey; place?: string; kind?: LoyaltyKind; page: number; pageSize: number }`, `LoyaltyActivityPage = { rows: LoyaltyActivityRow[]; total: number; page: number; pageSize: number }`, `LoyaltyTile = { value: number; change: number | null; small: boolean }`, `LoyaltySummary = Record<"cardsIssued" | "activeCards" | "stamps" | "rewardsEarned" | "rewardsRedeemed", LoyaltyTile>`.
  - `api.loyaltyProgram(locationId) → Promise<LoyaltyProgram | null>`, `api.saveLoyaltyProgram(locationId, input) → Promise<LoyaltyProgram>`, `api.loyaltyJoinLink(locationId) → Promise<{ url: string | null; token: string }>`, `api.rotateLoyaltyQr(locationId) → Promise<LoyaltyProgram>`, `api.loyaltyCard(locationId, code) → Promise<StaffCard>`, `api.loyaltyStamp(body: { locationId: string; code: string; idempotencyKey: string }) → Promise<LoyaltyStampResult>`, `api.loyaltyRedeem(body same) → Promise<{ cardId: string; rewardId: string }>`, `api.loyaltyVoid(body: { cardId: string; reason: string; idempotencyKey: string }) → Promise<LoyaltyStampResult>`, `api.loyaltyActivity(q) → Promise<LoyaltyActivityPage>`, `api.loyaltyBand(range, place?) → Promise<LoyaltySummary>`. URLs are Delivery A's (`/api/loyalty/program`, `/program/join-link`, `/program/rotate-qr`, `/card`, `/stamps`, `/redeem`, `/void`, `/activity`, `/api/insights/loyalty`).
  - Menus. In `platformNav`, when `access.retention !== "locked"` and `me.canReadLoyalty`, the Modules group's `retention` item becomes `{ id: "retention", label: "Retention", href: me.canStampLoyalty ? "/loyalty/stamp" : "/loyalty/activity", children }`, with children `loyalty-stamp` "Stamp a card" `/loyalty/stamp` (only with `canStampLoyalty`), `loyalty-activity` "Loyalty activity" `/loyalty/activity` and `loyalty-program` "Program & QR" `/loyalty/program`. Locked keeps today's locked item. In `managerNav`, with `me.canReadLoyalty`, after Reputation: `{ id: "loyalty", label: "Loyalty", href: "/loyalty/activity", icon: Stamp }` with children `loyalty-activity` "Activity" and `loyalty-program` "Programs & QR".

- [ ] **Step 1: Write the failing tests**

```ts
// modules/crm/tests/lookup.test.ts
test("staff of the place finds a card by code, with its accent, pending rewards and last 5 events newest first", async () => {});
test("a code with dashes or lower case finds the same card", async () => {});
test("an unknown code, a malformed code and a place outside the scope are all CardNotFoundError", async () => {});
test("a role without loyalty:read is LoyaltyForbiddenError", async () => {});
test("the result holds no token, hash, device or guest field", async () => {
  expect(Object.keys(card).sort()).toEqual(["accent","cardId","locationId","locationName","programName","recent",
    "rewardLabel","rewardReady","rewardsPending","shortCode","stampsInCycle","stampsRequired","state"]);
});
// apps/api/tests/loyalty.test.ts
test("GET /api/loyalty/card: 200 for staff of the place, 404 for another place, 422 for a bad id, 403 feature_locked below Pillar 3", async () => {});
test("/api/me carries the four loyalty flags by role", async () => {
  // client_staff: read, stamp, redeem true; manage false. account_manager: read, manage true; stamp, redeem false.
});
// packages/ui/tests/nav.test.ts
test("an owner with retention open gets Retention with Stamp a card, Loyalty activity and Program & QR", () => {});
test("retention locked keeps the locked Retention item and no loyalty children", () => {});
test("the account manager gets Loyalty with Activity and Programs & QR", () => {});
// packages/ui/tests/loyalty-api.test.ts
test("stamp posts the body as given and a 409 keeps reason and retryAt in detail", async () => {
  // fakeFetch answers 409 {error:"refused",reason:"cooldown",retryAt:"2026-10-19T16:40:00.000Z"}
  expect(err.status).toBe(409);
  expect(err.code).toBe("refused");
  expect(err.detail.retryAt).toBe("2026-10-19T16:40:00.000Z");
});
test("activity builds range, place, kind, page and pageSize into the query", async () => {});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test modules/crm/tests/lookup.test.ts apps/api/tests/loyalty.test.ts && cd packages/ui && bun test tests/nav.test.ts tests/loyalty-api.test.ts`
Expected: FAIL (`lookupCard` not exported, route 404, flags missing, nav items missing).

- [ ] **Step 3: Implement** `lookupCard` (read the card by `(location_id, short_code)` after `normalizeShortCode`, the program, the pending rewards and the last 5 events, mapped like `listActivity` rows), the route, the flags, the API client and the menus, all as listed in the interfaces.

- [ ] **Step 4: Run the tests and the gates**

Run: `bun run db:migrate && bun run test && bun run lint && bun run typecheck && bun run check:deps`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/crm/application/activity.ts modules/crm/index.ts modules/crm/tests/lookup.test.ts apps/api/src/loyalty.ts apps/api/src/cases.ts apps/api/tests/loyalty.test.ts packages/ui/src/api.ts packages/ui/src/shell/nav.ts packages/ui/tests/fake-api.ts packages/ui/tests/nav.test.ts packages/ui/tests/loyalty-api.test.ts
git commit -m "feat(loyalty): a staff card lookup, the loyalty flags on /me, the client API and the menus" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Program setup, the join QR and the printable poster

**Files:**
- Create: `packages/ui/src/loyalty/program-page.tsx`, `join-qr-panel.tsx`, `print-page.tsx`; `apps/platform/app/(app)/loyalty/program/page.tsx`, `apps/platform/app/print/loyalty/page.tsx`, `apps/manager/app/(app)/loyalty/program/page.tsx`, `apps/manager/app/print/loyalty/page.tsx`
- Modify: `packages/ui/src/loyalty/copy.ts` (add `POSTER_COPY`), `packages/ui/src/loyalty/index.ts`
- Test: `packages/ui/tests/loyalty-program.test.tsx`

**Interfaces:**
- Consumes: `api.places`, `api.loyaltyProgram`, `api.saveLoyaltyProgram`, `api.loyaltyJoinLink`, `api.rotateLoyaltyQr`, `useMe` (Task 5); `LoyaltyCardFace`, `ACCENT_STYLE`, `LOYALTY_ACCENTS` (Task 3); `PageHeader`, `Card`, `TextField`, `NumberField`, `RadioGroup`/`Radio`, `Switch`, `Button`, `ConfirmDialog`, `Banner`, `ModulePage`, `NotAvailable`, `QRCodeSVG`.
- Produces:
  - `LoyaltyProgramPage()`: the place selector (the `?place=` param via `writeParams`; it preselects when there is only one place), the form, the live preview, and `JoinQrPanel` when `me.canManageLoyalty`.
  - `JoinQrPanel({ locationId, onRotated }: { locationId: string; onRotated?: () => void })`
  - `LoyaltyPrintPage({ locationId, format, lang }: { locationId: string; format: "poster" | "cards"; lang: CardLocale })`
  - `POSTER_COPY: Record<CardLocale, { title: string; scan: string; reward: string }>`: EN `Collect stamps at {venue}` / `Scan with your phone camera. No app, no sign-up.` / `{stamps} stamps: {reward}`; ES `Colecciona sellos en {venue}` / `Escanea con la cámara del móvil. Sin app, sin registro.` / `{stamps} sellos: {reward}`.
  - `loyaltyFailure(e: unknown): "locked" | "forbidden" | "error"` in `program-page.tsx`, exported for Tasks 7 and 8: `403` with code `feature_locked` → `locked`; any other `403` → `forbidden`; anything else → `error`.

**Behaviour.**
- Defaults for a place with no program: name "Loyalty card", 8 stamps, reward empty, 240 minutes, `lime`, active.
- Fields: name (1–120), stamps needed (`NumberField` 2–20), reward (1–80, counter), cooldown in minutes (0–1440, hint "4 hours is 240"), accent as four radio swatches showing `ACCENT_STYLE[a].fill` with their label, and an Active switch (hint "A paused card still opens and keeps its stamps; it cannot be stamped").
- Client-side checks mirror the API limits. A `422` shows `detail.message` in a `Banner`. Save is shown only with `canManageLoyalty`; otherwise the fields are disabled and a line says "Only the owner or the Atrium team can change the program."
- The preview is `LoyaltyCardFace` with `stampsInCycle: Math.min(3, stamps - 1)` in the chosen accent.
- `JoinQrPanel` shows the `QRCodeSVG` of `url` (size 160) with "Copy link", "Print poster" and "Print table cards" (links to `/print/loyalty?locationId=…&format=poster|cards`, `target="_blank"`, `rel="noreferrer"`). "Rotate QR" is a `ConfirmDialog` ("Every printed join QR stops working. Cards already issued keep working.") that refetches the link. A `null` url shows `Banner status="warning"` "QR_CARD_URL is not set on the server."
- `LoyaltyPrintPage` loads `places`, `loyaltyProgram` and `loyaltyJoinLink`. Its toolbar (hidden in print through Tailwind `print:hidden`) has Print (`window.print()`) and EN/ES links. A `<style>` sets `@page { size: A4 portrait; margin: 12mm }`.
  - `poster` is one sheet: the venue in the serif at 64 px, the title, a 90 mm QR, the scan line and the reward line.
  - `cards` is a 2×2 grid of A6 cards (`148mm × 105mm` each, dashed cut lines), each a smaller copy with a 45 mm QR.
  - Ink on cream, no accent fill in print. `print-color-adjust: exact` is not needed.
  - A `401` shows "Sign in to the Platform first." A locked or forbidden answer shows the same text as on screen.
- The app pages are thin. Platform and Manager `print/loyalty/page.tsx` are server pages that read `searchParams` (`locationId`, `format` default `poster`, `lang` default `en`) and render `<LoyaltyPrintPage …/>` outside the `(app)` frame.

- [ ] **Step 1: Write the failing tests** in `packages/ui/tests/loyalty-program.test.tsx` (with `MeProvider` and `fakeFetch`)

```tsx
test("a place with no program starts from the defaults", async () => {
  expect((await screen.findByLabelText("Stamps needed") as HTMLInputElement).value).toBe("8");
  expect((screen.getByLabelText("Cooldown (minutes)") as HTMLInputElement).value).toBe("240");
  expect((screen.getByRole("radio", { name: "Lime" }) as HTMLInputElement).checked).toBe(true);
});
test("the owner saves: PUT carries the place and exactly the six fields", async () => {
  expect(Object.keys(JSON.parse(putBody)).sort()).toEqual(
    ["accent","active","cooldownMinutes","locationId","name","rewardLabel","stampsRequired"]);
});
test("a 422 shows the API message", async () => { /* detail.message "rewardLabel: 1 to 80 characters" visible */ });
test("staff sees the program read-only and no join QR", async () => {});
test("the preview follows the form: 10 stamps in clay", async () => {
  expect(document.querySelectorAll("[data-stamp]")).toHaveLength(10);
  expect(document.querySelectorAll('[data-stamp="filled"].bg-clay-500').length).toBeGreaterThan(0);
});
test("the join panel draws the QR, offers print links, and Rotate asks first then refetches", async () => {});
test("a null join url warns that QR_CARD_URL is not set", async () => {});
test("403 feature_locked shows the locked Retention page", async () => {
  expect(await screen.findByText("Not in your plan yet.")).toBeTruthy();
});
test("the print page: poster has one QR, cards has four, lang es uses the Spanish poster copy", async () => {});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/ui && bun test tests/loyalty-program.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the components and the four app pages as above.

- [ ] **Step 4: Run the tests and the builds**

Run: `cd packages/ui && bun test && cd ../.. && bun run lint && bun run typecheck && bun run --filter @atrium/platform build && bun run --filter @atrium/manager build`
Expected: PASS; both builds list `/loyalty/program` and `/print/loyalty`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/loyalty packages/ui/tests/loyalty-program.test.tsx "apps/platform/app/(app)/loyalty/program" apps/platform/app/print "apps/manager/app/(app)/loyalty/program" apps/manager/app/print
git commit -m "feat(loyalty): program setup with a live card preview, the join QR and a printable poster" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The stamp screen

**Files:**
- Create: `packages/ui/src/loyalty/keys.ts`, `scanner.ts`, `stamp-page.tsx`; `apps/platform/app/(app)/loyalty/stamp/page.tsx`
- Modify: `packages/ui/src/loyalty/index.ts`
- Test: `packages/ui/tests/loyalty-stamp.test.tsx`

**Interfaces:**
- Consumes: `api.places`, `api.loyaltyCard`, `api.loyaltyStamp`, `api.loyaltyRedeem`, `api.loyaltyVoid`, `ApiError.detail` (Task 5); `normalizeCardCode`, `formatCardCode`, `parseScannedCode`, `StampGrid`, `ACCENT_STYLE` (Task 3); `loyaltyFailure` (Task 6).
- Produces:
  - `createKeyRing(gen?: () => string): { keyFor(action: "stamp" | "redeem" | "void", cardKey: string): string; settle(action: "stamp" | "redeem" | "void", cardKey: string): void }`. The same `(action, cardKey)` gets the same key until `settle`. The default `gen` is `crypto.randomUUID`.
  - `type CardScanner = { supported(): boolean; start(video: HTMLVideoElement, onCode: (raw: string) => void): Promise<() => void> }` and `barcodeScanner: CardScanner`. It uses `getUserMedia({ video: { facingMode: "environment" } })` and `new BarcodeDetector({ formats: ["qr_code"] })`, checks every 250 ms, and its stop function stops every track.
  - `LoyaltyStampPage({ scanner?, now? }: { scanner?: CardScanner; now?: () => Date })`

**Behaviour.**
- The place selector (`?place=`; the only place is preselected). The code field: label "Card code", placeholder `XXXX-XXXX`, `autoCapitalize="characters"`, `autoComplete="off"`, formatted as the staff type. "Find card" (Enter submits) calls `api.loyaltyCard`. "Scan card" is shown only when `scanner.supported()`. It opens a `Dialog` with a `<video muted playsInline>`; the first code `parseScannedCode` accepts fills the field, closes the dialog, stops the camera and finds the card. A scan that is not a card says "That QR is not an Atrium card."
- The card panel: code in the serif at 40 px; place; state badge (Active / Paused / Closed); `StampGrid` in the card's accent; `<serif>3</serif> <em>of</em> 8` and the reward; "Reward ready" plus a pending count when `rewardsPending > 0`. The last 5 events form a small list (when, what, by), plus the void note.
- "Add stamp" is a large primary button, full width under `sm`. It is enabled only for `state === "active"` and `me.canStampLoyalty`, and it is busy (disabled, `aria-busy`) while a request runs. "Redeem reward" is shown with `rewardsPending > 0` and `canRedeemLoyalty`; it works on paused and closed cards too. "Void last stamp" needs `canManageLoyalty`. It opens a `Dialog` with a reason field: label "Reason", `maxLength={200}`, a live counter, the hint "Do not write guest details (names, phone numbers or emails).", and Confirm disabled until it is trimmed non-empty.
- Keys come from `keyRing.keyFor(action, `${locationId}:${code}` or the `cardId` for void)`. `settle` runs on any answer the server decided (`2xx`, `404`, `409`, `422`). On a network error, `5xx` or `429` the key is kept, so "Try again" reuses it. After every success the card is looked up again.
- Feedback goes to a `role="status"` region (polite), and errors to `role="alert"`:
  - stamp ok: "Stamp added. {n} of {total}." When `rewardEarned`: "Card complete. The reward is ready: {reward}."
  - redeem ok: "Reward redeemed."; void ok: "Last stamp voided."
  - `409 refused` with `cooldown`: "Already stamped recently. Next stamp from {time}." `{time}` is `HH:mm` local when `retryAt` is today, else `EEE HH:mm` (`toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })`). With `paused`: "This program is paused."; with `closed`: "This card is closed."
  - `409 no_reward`: "This card has no reward to redeem."; `409 nothing_to_void`: "There is no stamp to void in this cycle."
  - `404`: "No card with that code at this place."; `429`: "Too many tries. Wait a minute and try again."
  - `loyaltyFailure` → `locked` renders `ModulePage feature="retention"`; `forbidden` renders `NotAvailable`.
- The app page is thin. Manager has no stamp page (agency roles cannot stamp).

- [ ] **Step 1: Write the failing tests** in `packages/ui/tests/loyalty-stamp.test.tsx` (`fakeFetch`; a fake scanner whose `start` stores `onCode`)

```tsx
test("createKeyRing: same key until settled, a new one after", () => {
  let i = 0; const ring = createKeyRing(() => `k${++i}`);
  expect(ring.keyFor("stamp", "p:ABCDEFGH")).toBe("k1");
  expect(ring.keyFor("stamp", "p:ABCDEFGH")).toBe("k1");
  ring.settle("stamp", "p:ABCDEFGH");
  expect(ring.keyFor("stamp", "p:ABCDEFGH")).toBe("k2");
});
test("the only place is preselected; typing abcdefgh shows ABCD-EFGH and Find shows the card", async () => {});
test("Add stamp: one POST with locationId, code and a key; the result is announced; the card is looked up again", async () => {});
test("Review Focus 3: a network failure then Try again posts the same key; a double click posts once", async () => {
  expect(stampBodies.map((b) => b.idempotencyKey)).toEqual([stampBodies[0].idempotencyKey, stampBodies[0].idempotencyKey]);
});
test("cooldown: the next stamp time is shown in local time, with the weekday when not today", async () => {
  // now = 2026-10-19T12:00 local; retryAt today 16:40 → "Next stamp from 16:40"; retryAt tomorrow → contains the weekday
});
test("paused card: Add stamp disabled, Redeem still offered when a reward is pending", async () => {});
test("void: needs the manage flag, a reason of at most 200 characters, and shows the guest-details hint", async () => {
  expect(screen.getByText("Do not write guest details (names, phone numbers or emails).")).toBeTruthy();
  expect((screen.getByLabelText("Reason") as HTMLInputElement).maxLength).toBe(200);
});
test("a scanned card code fills the field and finds the card; a scanned URL is refused", async () => {});
test("no Scan button when the scanner is not supported", () => {});
test("404 and 429 have their messages; feature_locked shows the locked Retention page", async () => {});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/ui && bun test tests/loyalty-stamp.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `keys.ts`, `scanner.ts`, `stamp-page.tsx` and the Platform page as above.

- [ ] **Step 4: Run the tests and the build**

Run: `cd packages/ui && bun test && cd ../.. && bun run lint && bun run typecheck && bun run --filter @atrium/platform build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/loyalty packages/ui/tests/loyalty-stamp.test.tsx "apps/platform/app/(app)/loyalty/stamp"
git commit -m "feat(loyalty): the stamp screen: find or scan a card, stamp, redeem and void with client keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The activity page (summary band and table) on Platform and Manager

**Files:**
- Create: `packages/ui/src/loyalty/activity-band.tsx`, `activity-columns.tsx`, `activity-page.tsx`; `apps/platform/app/(app)/loyalty/activity/page.tsx`, `apps/manager/app/(app)/loyalty/activity/page.tsx`
- Modify: `packages/ui/src/loyalty/index.ts`
- Test: `packages/ui/tests/loyalty-activity.test.tsx`

**Interfaces:**
- Consumes: `api.loyaltyBand`, `api.loyaltyActivity`, `api.places` (Task 5); `loyaltyFailure` (Task 6); `DataSectionPage`, `SectionBand`, `KpiTile`, `PageControls`, `Tabs`, `DataTable` (dense), `useRangeState({ scope: "place" })`, `useTableState`, `writeParams`, `EmptyState`, `ErrorState`, `Skeleton`, all as `responses-page.tsx` uses them.
- Produces:
  - `LoyaltyBandView({ band, state, onRetry }: { band: LoyaltySummary | null; state: "loading" | "error" | "ok"; onRetry: () => void })`
  - `loyaltyColumns(opts: { now: Date }): Column<LoyaltyActivityRow>[]`
  - `LoyaltyActivityPage()`: the same component on both surfaces. There is no stamp action on it, so it is read-only by construction.

**Behaviour.** Follow `ResponsesTablePage` step by step (its request and stale-answer handling, the redirect for a page past the end, the band with its own error).
- Title "Loyalty activity", description "Stamps, rewards and voids on your cards." The controls are `PageControls` (range 7d/30d/90d, place, "All places").
- The band is `SectionBand` titled "Loyalty summary", with four `KpiTile`s: "Cards issued" (`tone="lime"`), "Active cards" (note "stamped in the range"), "Stamps" and "Rewards earned". The aside block "Rewards redeemed" shows the figure in the serif with the italic unit `of {earned} earned`. Each tile has `state="ok"` and carries a `delta` (`deltaUnit "%"`) only when `change !== null`. When `small` it carries the note "change shows from 10 a window".
- Tabs (`?kind=`): All, Stamps (`stamp`), Rewards earned (`reward_earned`), Redeemed (`reward_redeemed`), Voids (`void`).
- Columns: When (date and time, relative to `now` like the responses table), Place, Card (the short code, `tabular-nums`), What (Stamp / Reward earned / Reward redeemed / Void), By (`actorName ?? "System"`), Note (void only). The table is not sortable: the API orders by date only, and the footer note says "newest first". Page size 25, server paged.
- Empty with filters: "Your filters found nothing" with Clear filters. Empty without: "No activity yet" / "Stamps appear here as soon as the staff add them."
- `loyaltyFailure` from either request: `locked` renders `ModulePage feature="retention"`, `forbidden` renders `NotAvailable`. A page without `canReadLoyalty` renders `NotAvailable`.

- [ ] **Step 1: Write the failing tests** in `packages/ui/tests/loyalty-activity.test.tsx`

```tsx
test("the band shows the five figures and a change only where change is not null", async () => {});
test("rows show when, place, code, what and by; only a void shows its note", async () => {});
test("the Voids tab requests kind=void and writes ?kind=void", async () => {});
test("page 2 requests page=2&pageSize=25", async () => {});
test("a band failure shows its retry and leaves the table", async () => {});
test("feature_locked from the band or the table shows the locked Retention page", async () => {});
test("the agency sees the same page with every place in the selector", async () => {});
test("no Stamp, Redeem or Void control anywhere on the page", async () => {
  expect(screen.queryByRole("button", { name: /stamp|redeem|void/i })).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/ui && bun test tests/loyalty-activity.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the three components and both thin app pages.

- [ ] **Step 4: Run the tests and the builds**

Run: `cd packages/ui && bun test && cd ../.. && bun run lint && bun run typecheck && bun run --filter @atrium/platform build && bun run --filter @atrium/manager build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/loyalty packages/ui/tests/loyalty-activity.test.tsx "apps/platform/app/(app)/loyalty/activity" "apps/manager/app/(app)/loyalty/activity"
git commit -m "feat(loyalty): the activity page with the loyalty summary band, on Platform and Manager" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs, ADR, ports, CI and the end-to-end check

**Files:**
- Modify (EN and ES each, the ES files under `apps/docs/i18n/es/docusaurus-plugin-content-docs/current/`): `guides/loyalty-and-qr-card.md` (drop the "coming" note and markers; add "Use it" for guest, staff and owner, and the proxy section), `guides/local-development.md` (the qr-card line `# :3006` and the loyalty smoke), `guides/environment-variables.md` (`QR_CARD_PROXY_HOPS`, `LOYALTY_PROXY_SECRET`; `API_URL` also used by qr-card), `product/using-the-system.md` (a **Card** row: port 3006, the guest, no account), `product/platform.md`, `product/manager.md` (the Loyalty screens), `adr/0022-loyalty-card-device-bound.md` (rewrite the "Client IP" consequence into the decision of Task 1, and add: the card QR holds the short code, not the token; the token is in the `/c/` path for home-screen shortcuts; no web manifest)
- Modify: `.github/workflows/ci.yml` (after `bun run test`: `- run: bun run build:apps`), root `package.json` (`"build:apps": "turbo run build --filter=@atrium/qr-card --filter=@atrium/platform --filter=@atrium/manager --filter=@atrium/hub"`)
- Do not modify: `.env.example` (the final report lists the lines instead)

**Interfaces:**
- Consumes: everything above.
- Produces: docs and a CI step; no code.

- [ ] **Step 1: Write the docs and the CI step** as listed. The ADR keeps its number and status and gains a dated "Delivery B" paragraph. Keep the docs' voice: plain sentences, tables for routes and variables, the brand italics in headings.

- [ ] **Step 2: Run the full gate**

Run: `bun run ci && bun run build:apps && bun run docs:build`
Expected: all green; `docs:build` reports no broken links in either locale.

- [ ] **Step 3: The end-to-end check against the real API** (the controller repeats it in Chrome)

```bash
export LOYALTY_SECRET=dev-loyalty-secret-0123456789abcdef0123 LOYALTY_PROXY_SECRET=dev-proxy-secret-0123456789abcdef01234 TRUST_PROXY=1
bun --env-file=.env.local run seed:loyalty
bun --env-file=.env.local run --filter @atrium/api dev       # :3001
bun --env-file=.env.local run --filter @atrium/qr-card dev   # :3006
bun --env-file=.env.local run --filter @atrium/platform dev  # :3003
bun --env-file=.env.local run --filter @atrium/manager dev   # :3002
# The overwrite holds: 21 joins without a cookie jar and with a different spoofed address each time
for i in $(seq 1 21); do curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3006/loyalty-api/cards \
  -H 'content-type: application/json' -H "x-forwarded-for: 10.9.$i.1" -d '{"joinToken":"<printed token>"}'; done
```
Expected: twenty `201` and then one `429`. With `QR_CARD_PROXY_HOPS` unset (0), the spoofed addresses never reach the API, so they do not open new buckets. Run it on a fresh hour or with a reset `crm.rate_counters`. A run with `QR_CARD_PROXY_HOPS=1` and no real proxy in front would trust curl's header; that is why production sets the value to the real number of proxies.

Manual checklist (Chrome, `localhost`):
- [ ] Phone viewport 390×844: open a printed join URL. The card appears at `/c/<token>`, `/j/` is not in Back history, and the venue, the 0-of-N grid in the program accent, the reward, the short code and its QR are all visible, with no sideways scroll at 360 px.
- [ ] Platform as `demo-owner@demo.test`: Retention › Stamp a card. Type the card's code and click Add stamp. Within 5 s the phone tab shows the new stamp with the announcement. Add stamp again: the cooldown message shows the next time.
- [ ] Program & QR: set 2 stamps and cooldown 0, save, stamp twice. The card shows the lime "Your reward is ready". Redeem on the stamp screen; the card goes back to 0.
- [ ] Void last stamp: the hint is visible and the reason stops at 200 characters. Activity lists the void with its note.
- [ ] Pause the program: the card says "This card is paused" within 30 s on a hidden tab or 5 s on a visible one, and Add stamp is disabled.
- [ ] The email step: submit with the box unticked is refused. Ticked, "Done" shows, and reloading does not show the form again.
- [ ] Print poster and Print table cards: the print preview is one A4 page each, with no app frame.
- [ ] Rotate QR: the old join URL shows "This QR no longer works"; issued cards keep working.
- [ ] Manager as `demo-am@demo.test`: Loyalty › Activity shows the rows read-only; Programs & QR edits the program.
- [ ] A client below Pillar 3 (switch the package back) sees the locked Retention page on every loyalty screen, while the public card still opens.
- [ ] Spanish: with Chrome language `es` the card reads "0 de 8 sellos".
- [ ] Keyboard only on the stamp screen: find, stamp, redeem and void are all reachable, with a visible focus ring. With "reduce motion" on, the stamp appears without animation.
- [ ] DevTools › Network on the card: polls carry `If-None-Match` and get `304`; there are no third-party requests; the response headers include `Referrer-Policy: no-referrer`.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/docs apps/docs/i18n .github/workflows/ci.yml package.json
git commit -m "docs(loyalty): the card app, the staff screens, the proxy and the ports, in English and Spanish; CI builds the apps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Environment lines for the user's `.env.example`** (not edited by any task): `LOYALTY_PROXY_SECRET=` (32+ characters, the same value for the API and qr-card; the API trusts `X-Forwarded-For` only with it), `QR_CARD_PROXY_HOPS=0` (how many proxies sit in front of qr-card in production). `QR_CARD_URL` and `API_URL` are already there; `API_URL` is also read by qr-card.
