import { devTransport, type NotificationTransport } from "../domain/notifications";
import { resendTransport } from "./resend";

type Env = Record<string, string | undefined>;

/**
 * The transport a process uses. Resend when the key and the sender are set; the development
 * transport only in development and test. An unset NODE_ENV counts as production, so a process
 * that forgot its key refuses to start instead of silently recording mail it never sends.
 */
export function transportFromEnv(env: Env): NotificationTransport {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (apiKey && from) return resendTransport({ apiKey, from });
  if (apiKey || from) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set together");
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return devTransport;
  throw new Error("RESEND_API_KEY and EMAIL_FROM are required outside development and test");
}
