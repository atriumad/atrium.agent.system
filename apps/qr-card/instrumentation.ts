import { proxyWarning } from "./lib/startup-warning";

/** Runs once when the server starts. */
export function register() {
  const warning = proxyWarning(process.env);
  if (warning) console.warn(warning);
}
