export type StartupEnv = {
  NODE_ENV?: string | undefined;
  QR_CARD_PROXY_HOPS?: string | undefined;
  LOYALTY_PROXY_SECRET?: string | undefined;
};

const SECRET_MIN = 32;

/**
 * The one-line warning for a production start where the API cannot tell guests apart, or null.
 * Without a trusted hop and a proxy secret every guest reaches the API from the card app's own
 * address, so they all share one rate-limit bucket. It never carries a value from the environment.
 */
export function proxyWarning(env: StartupEnv): string | null {
  if (env.NODE_ENV !== "production") return null;
  const hops = Number(env.QR_CARD_PROXY_HOPS ?? 0);
  const noHops = !Number.isInteger(hops) || hops < 1;
  const noSecret = (env.LOYALTY_PROXY_SECRET ?? "").length < SECRET_MIN;
  if (!noHops && !noSecret) return null;
  const missing = [noHops ? "QR_CARD_PROXY_HOPS" : null, noSecret ? "LOYALTY_PROXY_SECRET" : null]
    .filter(Boolean)
    .join(",");
  return `qr-card: warning=shared_rate_limit_bucket missing=${missing} detail="all guests share one rate-limit bucket until set"`;
}
