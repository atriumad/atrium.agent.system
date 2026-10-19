import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { accessFor, can, type Scope, withScope } from "@atrium/core";
import {
  type ActivityKind,
  attachEmail,
  type CardLookup,
  CardNotFoundError,
  type CrmDeps,
  checkRate,
  getCardByToken,
  getProgram,
  InvalidProgramError,
  InvalidStampInputError,
  issueCard,
  joinToken,
  LoyaltyForbiddenError,
  listActivity,
  looksLikeCardToken,
  loyaltySummary,
  NoRewardError,
  NothingToVoidError,
  type ProgramInput,
  redeemReward,
  rotateJoinQr,
  StampRefusedError,
  type SummaryRange,
  stampCard,
  upsertProgram,
  voidLastStamp,
} from "@atrium/crm";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import type { AppDeps } from "./app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE = /^\d+$/;
const DEVICE_COOKIE = "atr_card_dev";
const DEVICE_COOKIE_SECONDS = 60 * 60 * 24 * 365;
const MAX_PUBLIC_BODY = 8 * 1024;
const MAX_TOKEN_CHARS = 200;
const MAX_EMAIL_CHARS = 320;
const RANGES: readonly string[] = ["7d", "30d", "90d"];
const KINDS: readonly string[] = ["stamp", "reward_earned", "reward_redeemed", "void"];

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `LOYALTY_SECRET` must be at least this long, or the loyalty routes are not mounted. */
export const MIN_LOYALTY_SECRET_CHARS = 32;

/** The secret when it is long enough to sign with, otherwise undefined. */
export function usableLoyaltySecret(value: string | undefined): string | undefined {
  return value && value.length >= MIN_LOYALTY_SECRET_CHARS ? value : undefined;
}

export type LoyaltySecrets = {
  /** `LOYALTY_SECRET`: signs the join tokens and the device hash. */
  loyaltySecret: string;
  /** `QR_CARD_URL`: the public origin of the card app, where the join QR points. */
  qrCardUrl?: string | undefined;
};

const crmDeps = (deps: AppDeps, secret: string): CrmDeps => ({
  secret,
  ...(deps.now ? { now: deps.now } : {}),
  ...(deps.publish ? { publish: deps.publish } : {}),
});

/**
 * Whether `X-Forwarded-For` and `X-Forwarded-Proto` may be believed: the deployment says a proxy it
 * controls sits in front (`TRUST_PROXY`) and, when `LOYALTY_PROXY_SECRET` is set, the request carries
 * it in `x-atrium-proxy`. The API is public for connectors, so without the secret anyone calling it
 * directly could pick their own address.
 */
function trustsForwarding(c: Context, trustProxy: boolean, proxySecret?: string): boolean {
  if (!trustProxy) return false;
  if (!proxySecret) return true;
  const sent = Buffer.from(c.req.header("x-atrium-proxy") ?? "");
  const want = Buffer.from(proxySecret);
  return sent.length === want.length && timingSafeEqual(sent, want);
}

/**
 * The caller's address. The first hop of `X-Forwarded-For` only when the deployment says a proxy
 * it controls sits in front (`trustProxy`) and the hop is a real address; otherwise the socket's.
 * Anything else a client can write is ignored.
 */
function clientIp(c: Context, trustProxy: boolean, proxySecret?: string): string {
  if (trustsForwarding(c, trustProxy, proxySecret)) {
    const first = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (first && isIP(first)) return first;
  }
  const server = c.env as { requestIP?: (r: Request) => { address: string } | null } | undefined;
  return server?.requestIP?.(c.req.raw)?.address ?? "unknown";
}

/**
 * Whether the device cookie is Secure: the request is https, a trusted proxy says it was, the card
 * app's public origin is https, or this is production. An untrusted `X-Forwarded-Proto` counts for nothing.
 */
function isHttps(
  c: Context,
  trustProxy: boolean,
  qrCardUrl?: string,
  proxySecret?: string,
): boolean {
  if (new URL(c.req.url).protocol === "https:") return true;
  if (qrCardUrl?.startsWith("https://") || process.env.NODE_ENV === "production") return true;
  return (
    trustsForwarding(c, trustProxy, proxySecret) &&
    c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
  );
}

function rateLimited(c: Context, retryAfter: number) {
  return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(retryAfter) });
}

/**
 * The routes a customer's phone calls, with no session: it holds a card token, nothing else.
 * Same-origin through the card app's rewrite, so there are no CORS headers. The device is the
 * httpOnly cookie this server set, hashed with the secret; a device id in a body is never read.
 * Nothing here returns a guest or an address.
 */
export function mountLoyaltyPublic(app: Hono<any>, deps: AppDeps) {
  const secret = deps.loyaltySecret;
  if (!secret) {
    // not the connector-token 401 of the rest of /v1: the feature is simply not there
    app.all("/v1/loyalty/*", (c) => c.json({ error: "not_found" }, 404));
    return;
  }
  const trustProxy = deps.trustProxy === true;
  const proxySecret = deps.loyaltyProxySecret;
  const crm = crmDeps(deps, secret);
  const now = () => deps.now?.() ?? new Date();

  app.use(
    "/v1/loyalty/*",
    bodyLimit({
      maxSize: MAX_PUBLIC_BODY,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
  );
  // a card token is a bearer secret: nothing a browser or a proxy keeps
  app.use("/v1/loyalty/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  app.post("/v1/loyalty/cards", async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = isObject(body) ? body.joinToken : undefined;
    if (typeof token !== "string" || token.length > MAX_TOKEN_CHARS) {
      return c.json({ error: "invalid" }, 410);
    }

    // The device is whatever this server issued. A value that is not a UUID is replaced.
    let deviceId = getCookie(c, DEVICE_COOKIE);
    if (!deviceId || !UUID.test(deviceId)) {
      deviceId = crypto.randomUUID();
      setCookie(c, DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        sameSite: "Lax",
        secure: isHttps(c, trustProxy, deps.qrCardUrl, proxySecret),
        maxAge: DEVICE_COOKIE_SECONDS,
        // The card app reaches this API through a rewrite on its own path, so a narrower path
        // would never be sent back.
        path: "/",
      });
    }
    const deviceHash = createHmac("sha256", secret).update(`device:${deviceId}`).digest("hex");

    const issued = await issueCard(
      deps.db,
      { joinToken: token, deviceHash, ip: clientIp(c, trustProxy, proxySecret) },
      crm,
    );
    if (issued.ok) {
      return c.json({ token: issued.card.token, shortCode: issued.card.shortCode }, 201);
    }
    const headers = issued.retryAfter ? { "Retry-After": String(issued.retryAfter) } : {};
    if (issued.reason === "rate_limited") return c.json({ error: "rate_limited" }, 429, headers);
    if (issued.reason === "device_limit") return c.json({ error: "device_limit" }, 409, headers);
    return c.json({ error: issued.reason }, 410);
  });

  app.get("/v1/loyalty/cards/:token", async (c) => {
    const token = c.req.param("token");
    // a path that cannot be a token costs nothing: no counter row is written for garbage
    if (!looksLikeCardToken(token)) return c.json({ error: "not_found" }, 404);
    const limit = await checkRate(
      deps.db,
      `read:token:${digest(token.slice(0, MAX_TOKEN_CHARS))}`,
      "readsPerToken",
      now(),
    );
    if (!limit.allowed) return rateLimited(c, limit.retryAfter);

    const view = await getCardByToken(deps.db, token, crm);
    if (!view) return c.json({ error: "not_found" }, 404);
    const etag = `"${view.etag}"`;
    const sent = (c.req.header("if-none-match") ?? "")
      .split(",")
      .map((v) => v.trim().replace(/^W\//, ""));
    if (sent.includes(etag)) return c.body(null, 304, { ETag: etag });
    c.header("ETag", etag);
    return c.json(view);
  });

  app.post("/v1/loyalty/cards/:token/email", async (c) => {
    const token = c.req.param("token");
    // a path that cannot be a token costs nothing: no counter row is written for garbage
    if (!looksLikeCardToken(token)) return c.json({ error: "unavailable" }, 404);
    const at = now();
    const byIp = await checkRate(
      deps.db,
      `email:ip:${digest(clientIp(c, trustProxy, proxySecret))}`,
      "joinPerIp",
      at,
    );
    if (!byIp.allowed) return rateLimited(c, byIp.retryAfter);
    const byToken = await checkRate(
      deps.db,
      `email:token:${digest(token.slice(0, MAX_TOKEN_CHARS))}`,
      "readsPerToken",
      at,
    );
    if (!byToken.allowed) return rateLimited(c, byToken.retryAfter);

    const body = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: "invalid_request" }, 400);
    if (body.consent !== true) return c.json({ error: "consent_required" }, 400);
    if (typeof body.email !== "string" || body.email.length > MAX_EMAIL_CHARS) {
      return c.json({ error: "invalid_email" }, 400);
    }
    const result = await attachEmail(
      deps.db,
      { cardToken: token, email: body.email, consent: true },
      crm,
    );
    if (result.ok) return c.body(null, 204);
    if (result.reason === "unavailable") return c.json({ error: "unavailable" }, 404);
    return c.json({ error: result.reason }, 400);
  });
}

type Env = { Variables: { scope: Scope; userName: string } };
type Action = "read" | "manage" | "stamp" | "redeem";

/** The staff routes, on the session-authenticated API. The role check is repeated in the use cases. */
export function mountLoyalty(api: Hono<Env>, deps: AppDeps, secrets: LoyaltySecrets) {
  const crm = crmDeps(deps, secrets.loyaltySecret);
  const now = () => deps.now?.() ?? new Date();

  api.use("/loyalty/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  /**
   * Permission first, then the package: Retention is a paid feature, and a client without it gets
   * the same answer on every route. The agency runs the product, so nothing is locked for it.
   */
  const guarded =
    (action: Action, handler: (c: Context<Env>, scope: Scope) => Promise<Response>) =>
    async (c: Context<Env>) => {
      const scope = c.get("scope");
      if (!can(scope.role, "loyalty", action)) return c.json({ error: "forbidden" }, 403);
      if (scope.kind === "client") {
        const access = await withScope(deps.db, scope, (tx) => accessFor(tx, scope.clientId));
        if (access.retention === "locked") {
          return c.json({ error: "feature_locked", feature: "retention" }, 403);
        }
      }
      try {
        return await handler(c, scope);
      } catch (error) {
        if (error instanceof LoyaltyForbiddenError) return c.json({ error: "forbidden" }, 403);
        if (error instanceof CardNotFoundError) return c.json({ error: "not_found" }, 404);
        if (error instanceof StampRefusedError) {
          return c.json(
            {
              error: "refused",
              reason: error.reason,
              retryAt: error.retryAt?.toISOString() ?? null,
            },
            409,
          );
        }
        if (error instanceof NoRewardError) return c.json({ error: "no_reward" }, 409);
        if (error instanceof NothingToVoidError) return c.json({ error: "nothing_to_void" }, 409);
        if (error instanceof InvalidProgramError || error instanceof InvalidStampInputError) {
          return c.json({ error: "invalid_request", message: error.message }, 422);
        }
        throw error;
      }
    };

  const locationOf = (value: unknown) =>
    typeof value === "string" && UUID.test(value) ? value : null;

  api.get(
    "/loyalty/program",
    guarded("read", async (c, scope) => {
      const locationId = locationOf(c.req.query("locationId"));
      if (!locationId) return c.json({ error: "invalid_id" }, 422);
      const program = await withScope(deps.db, scope, (tx) => getProgram(tx, scope, locationId));
      return c.json({ program });
    }),
  );

  api.put(
    "/loyalty/program",
    guarded("manage", async (c, scope) => {
      const body = await c.req.json().catch(() => null);
      if (!isObject(body)) return c.json({ error: "invalid_request" }, 422);
      const locationId = locationOf(body.locationId);
      if (!locationId) return c.json({ error: "invalid_id" }, 422);
      // only the program's own fields go on: nothing else in the body reaches the use case
      const input = {
        name: body.name,
        stampsRequired: body.stampsRequired,
        rewardLabel: body.rewardLabel,
        cooldownMinutes: body.cooldownMinutes,
        active: body.active,
        accent: body.accent,
      } as ProgramInput;
      const program = await withScope(deps.db, scope, (tx) =>
        upsertProgram(tx, scope, locationId, input, crm),
      );
      return c.json({ program });
    }),
  );

  api.post(
    "/loyalty/program/rotate-qr",
    guarded("manage", async (c, scope) => {
      const body = await c.req.json().catch(() => null);
      const locationId = locationOf(isObject(body) ? body.locationId : undefined);
      if (!locationId) return c.json({ error: "invalid_id" }, 422);
      const program = await withScope(deps.db, scope, async (tx) => {
        const found = await getProgram(tx, scope, locationId);
        return found ? rotateJoinQr(tx, scope, found.id) : null;
      });
      if (!program) return c.json({ error: "not_found" }, 404);
      return c.json({ program });
    }),
  );

  api.get(
    "/loyalty/program/join-link",
    guarded("manage", async (c, scope) => {
      const locationId = locationOf(c.req.query("locationId"));
      if (!locationId) return c.json({ error: "invalid_id" }, 422);
      const program = await withScope(deps.db, scope, (tx) => getProgram(tx, scope, locationId));
      if (!program) return c.json({ error: "not_found" }, 404);
      const token = joinToken(program, secrets.loyaltySecret);
      const origin = secrets.qrCardUrl?.replace(/\/$/, "");
      return c.json({ url: origin ? `${origin}/j/${token}` : null, token });
    }),
  );

  /** `{ locationId, code | cardToken, idempotencyKey }`, or the 422 that says what is wrong. */
  const parseCounterBody = (body: unknown) => {
    if (!isObject(body)) return { error: "invalid_request" as const };
    const locationId = locationOf(body.locationId);
    if (!locationId) return { error: "invalid_id" as const };
    const key = body.idempotencyKey;
    if (typeof key !== "string" || key.trim() === "" || key.length > 200) {
      return { error: "invalid_request" as const };
    }
    const hasCode = body.code !== undefined;
    const hasToken = body.cardToken !== undefined;
    if (hasCode === hasToken) return { error: "invalid_request" as const };
    const value = hasCode ? body.code : body.cardToken;
    if (typeof value !== "string" || value.length > MAX_TOKEN_CHARS) {
      return { error: "invalid_request" as const };
    }
    const lookup: CardLookup = hasCode
      ? { locationId, code: value }
      : { locationId, cardToken: value };
    return { lookup, idempotencyKey: key };
  };

  const counter = (
    action: "stamp" | "redeem",
    run: (scope: Scope, lookup: CardLookup, input: { idempotencyKey: string }) => Promise<unknown>,
    status: 200 | 201,
  ) =>
    guarded(action, async (c, scope) => {
      const parsed = parseCounterBody(await c.req.json().catch(() => null));
      if ("error" in parsed) return c.json({ error: parsed.error }, 422);
      // per signed-in user, never per address: a counter's phones share one
      const limit = await checkRate(
        deps.db,
        `${action}:user:${scope.userId}`,
        "stampsPerStaff",
        now(),
      );
      if (!limit.allowed) return rateLimited(c, limit.retryAfter);
      const result = await run(scope, parsed.lookup, { idempotencyKey: parsed.idempotencyKey });
      return c.json(result, status);
    });

  api.post(
    "/loyalty/stamps",
    counter(
      "stamp",
      (scope, lookup, input) =>
        withScope(deps.db, scope, (tx) => stampCard(tx, scope, lookup, input, crm)),
      201,
    ),
  );

  api.post(
    "/loyalty/redeem",
    counter(
      "redeem",
      (scope, lookup, input) =>
        withScope(deps.db, scope, (tx) => redeemReward(tx, scope, lookup, input, crm)),
      200,
    ),
  );

  api.post(
    "/loyalty/void",
    guarded("manage", async (c, scope) => {
      const body = await c.req.json().catch(() => null);
      if (!isObject(body)) return c.json({ error: "invalid_request" }, 422);
      const cardId = locationOf(body.cardId);
      if (!cardId) return c.json({ error: "invalid_id" }, 422);
      const { reason, idempotencyKey } = body;
      if (
        typeof reason !== "string" ||
        reason.trim() === "" ||
        reason.length > 200 ||
        typeof idempotencyKey !== "string" ||
        idempotencyKey.trim() === "" ||
        idempotencyKey.length > 200
      ) {
        return c.json({ error: "invalid_request" }, 422);
      }
      const result = await withScope(deps.db, scope, (tx) =>
        voidLastStamp(tx, scope, { cardId, reason, idempotencyKey }, crm),
      );
      return c.json(result);
    }),
  );

  const parseRangeAndPlace = (c: Context<Env>) => {
    const range = c.req.query("range") ?? "30d";
    if (!RANGES.includes(range)) return { error: "invalid_range" as const };
    const place = c.req.query("place");
    if (place !== undefined && !UUID.test(place)) return { error: "invalid_id" as const };
    return { range: range as SummaryRange, place };
  };

  api.get(
    "/loyalty/activity",
    guarded("read", async (c, scope) => {
      const parsed = parseRangeAndPlace(c);
      if ("error" in parsed) return c.json({ error: parsed.error }, 422);
      const kind = c.req.query("kind");
      if (kind !== undefined && !KINDS.includes(kind)) {
        return c.json({ error: "invalid_request" }, 422);
      }
      const whole = (value: string | undefined, fallback: number) =>
        value === undefined ? fallback : WHOLE.test(value) ? Number(value) : Number.NaN;
      const page = whole(c.req.query("page"), 1);
      const pageSize = whole(c.req.query("pageSize"), 25);
      if (!Number.isSafeInteger(page) || page < 1 || !(pageSize >= 1)) {
        return c.json({ error: "invalid_request" }, 422);
      }
      const result = await withScope(deps.db, scope, (tx) =>
        listActivity(tx, scope, {
          range: parsed.range,
          ...(parsed.place ? { locationId: parsed.place } : {}),
          ...(kind ? { kind: kind as ActivityKind } : {}),
          page,
          pageSize: Math.min(pageSize, 100),
          sort: "date",
          dir: "desc",
          now: now(),
        }),
      );
      return c.json(result);
    }),
  );

  api.get(
    "/insights/loyalty",
    guarded("read", async (c, scope) => {
      const parsed = parseRangeAndPlace(c);
      if ("error" in parsed) return c.json({ error: parsed.error }, 422);
      const summary = await withScope(deps.db, scope, (tx) =>
        loyaltySummary(tx, scope, {
          range: parsed.range,
          ...(parsed.place ? { locationId: parsed.place } : {}),
          now: now(),
        }),
      );
      return c.json(summary);
    }),
  );
}
