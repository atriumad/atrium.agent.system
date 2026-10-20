import { isIP } from "node:net";

export type ProxyEnv = {
  apiUrl: string;
  hops: number;
  proxySecret?: string | undefined;
  fetch?: typeof fetch;
};

const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const MAX_BODY = 8 * 1024;
const COOKIE = "atr_card_dev";

/** Read at most MAX_BODY bytes; null as soon as the body goes over, cancelling the rest. */
async function readCapped(req: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

const json = (status: number, body: object) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * The client address: the entry `hops` places from the right of `X-Forwarded-For`, which the
 * proxies we run appended. Everything left of it is whatever the client wrote. With no trusted
 * hop there is no answer: a route handler cannot see the socket, so it fails closed.
 */
export function clientIp(headers: Headers, hops: number): string | null {
  if (!Number.isInteger(hops) || hops < 1) return null;
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim());
  const entry = chain[chain.length - hops];
  return entry && isIP(entry) ? entry : null;
}

/** Which of the three card routes this is, or why it is not one. */
function route(method: string, path: string[]): "ok" | "method" | "none" {
  const [a, token, c, ...rest] = path;
  if (a !== "cards" || rest.length > 0) return "none";
  if (path.length === 1) return method === "POST" ? "ok" : "method";
  if (!token || !TOKEN.test(token)) return "none";
  if (path.length === 2) return method === "GET" ? "ok" : "method";
  if (path.length === 3 && c === "email") return method === "POST" ? "ok" : "method";
  return "none";
}

function deviceCookie(header: string | null): string | null {
  for (const pair of (header ?? "").split(";")) {
    const p = pair.trim();
    if (p.startsWith(`${COOKIE}=`)) return p;
  }
  return null;
}

/**
 * Forward one of the card routes to the API. The upstream request is built here from an allow-list,
 * never copied: it carries exactly one X-Forwarded-For (or none) and the proxy secret that tells
 * the API to believe it.
 */
export async function forwardLoyalty(
  req: Request,
  path: string[],
  env: ProxyEnv,
): Promise<Response> {
  const verdict = route(req.method, path);
  if (verdict === "none") return json(404, { error: "not_found" });
  if (verdict === "method") return json(405, { error: "method_not_allowed" });

  const headers = new Headers();
  for (const name of ["content-type", "accept", "accept-language", "if-none-match"]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const cookie = deviceCookie(req.headers.get("cookie"));
  if (cookie) headers.set("cookie", cookie);
  const ip = clientIp(req.headers, env.hops);
  if (ip) headers.set("x-forwarded-for", ip);
  if (env.hops >= 1) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (proto) headers.set("x-forwarded-proto", proto);
  }
  if (env.proxySecret) headers.set("x-atrium-proxy", env.proxySecret);

  let body: Uint8Array<ArrayBuffer> | undefined;
  if (req.method === "POST") {
    const read = await readCapped(req);
    if (!read) return json(413, { error: "payload_too_large" });
    body = read;
  }

  let upstream: Response;
  try {
    upstream = await (env.fetch ?? fetch)(
      `${env.apiUrl}/v1/loyalty/${path.map(encodeURIComponent).join("/")}`,
      {
        method: req.method,
        headers,
        ...(body === undefined ? {} : { body }),
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    return json(502, { error: "unavailable" });
  }

  const out = new Headers();
  for (const name of ["content-type", "etag", "retry-after"]) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  for (const raw of upstream.headers.getSetCookie()) {
    if (!raw.trim().startsWith(`${COOKIE}=`)) continue;
    const attrs = raw.split(";").map((s) => s.trim());
    const kept = attrs.filter((a) => !a.toLowerCase().startsWith("path="));
    out.append("set-cookie", [...kept, "Path=/loyalty-api"].join("; "));
  }
  out.set("cache-control", "no-store");
  const empty = upstream.status === 204 || upstream.status === 304;
  return new Response(empty ? null : upstream.body, { status: upstream.status, headers: out });
}
