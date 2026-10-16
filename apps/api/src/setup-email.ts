import { maskAddress, type NotificationTransport } from "@atrium/core";
import { renderSetPassword } from "@atrium/email";

type Log = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

/**
 * Emails a new owner the link to choose a password. The link is a credential, so nothing stores it:
 * not the outbox, not a log. A failure is logged with the masked address and a kind, never thrown.
 */
export async function sendSetPasswordEmail(
  transport: NotificationTransport,
  input: { email: string; url: string },
  log: Log,
): Promise<void> {
  try {
    const { html, text } = await renderSetPassword({ link: input.url });
    const result = await transport.deliver({
      channel: "email",
      to: input.email,
      subject: "Set your Atrium password",
      body: text,
      html,
      headers: null,
      idempotencyKey: `set-password-${crypto.randomUUID()}`,
    });
    const to = maskAddress(input.email);
    if (result.status === "failed") log.error("setup_email.failed", { to, kind: "rejected" });
    else if (result.status === "recorded") log.info("setup_email.recorded", { to });
    else log.info("setup_email.sent", { to });
  } catch (error) {
    log.error("setup_email.failed", {
      to: maskAddress(input.email),
      kind: error instanceof Error ? error.name : "unknown",
    });
  }
}
