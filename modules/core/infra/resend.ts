import type { NotificationTransport } from "../domain/notifications";

/**
 * The only error the transport lets out. A provider's own errors and a network error can carry the
 * address or the key, so this one holds a kind and a status and nothing else.
 */
export class TransportUnavailableError extends Error {
  readonly kind: "network" | "rate_limited" | "provider_error";
  readonly status?: number;
  constructor(kind: TransportUnavailableError["kind"], status?: number) {
    super(`email transport unavailable: ${kind}${status === undefined ? "" : ` (${status})`}`);
    this.name = "TransportUnavailableError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

export type ResendConfig = {
  apiKey: string;
  /** `Atrium <no-reply@mail.example.com>` */
  from: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** Sends through Resend's REST API. Docs: ADR 0021. A 4xx is a failed delivery; anything else throws. */
export function resendTransport(config: ResendConfig): NotificationTransport {
  const doFetch = config.fetch ?? fetch;
  return {
    name: "resend",
    async deliver(message) {
      let response: Response;
      try {
        response = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject ?? "",
            text: message.body,
            ...(message.html ? { html: message.html } : {}),
            ...(message.headers ? { headers: message.headers } : {}),
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
        });
      } catch {
        throw new TransportUnavailableError("network");
      }
      if (response.status === 429) throw new TransportUnavailableError("rate_limited", 429);
      if (response.status >= 500)
        throw new TransportUnavailableError("provider_error", response.status);
      if (!response.ok) return { status: "failed", providerId: null };
      const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
      return { status: "sent", providerId: typeof body?.id === "string" ? body.id : null };
    },
  };
}
