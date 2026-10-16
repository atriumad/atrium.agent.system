/**
 * Holds the one-time set-password link Better Auth builds for a new owner, long enough for the
 * approver to read it back, and hands it to delivery so the owner gets it by email too. A delivery
 * that fails never loses the link or fails the approval: the approver can still read it back.
 */
export type SetupLinkCapture = ReturnType<typeof createSetupLinkCapture>;

export type SetupLinkOptions = {
  deliver?: (input: { email: string; url: string }) => Promise<void>;
};

export function createSetupLinkCapture(options: SetupLinkOptions = {}) {
  const links = new Map<string, string>();
  return {
    onPasswordSetup: async ({ email, url }: { email: string; url: string }) => {
      links.set(email.toLowerCase(), url);
      try {
        // The link is stored before delivery, so a failure never loses it. Awaiting delivery makes
        // the approval wait up to the transport timeout: a known cost, accepted for now.
        await options.deliver?.({ email, url });
      } catch {
        // The link is already kept for the approver; delivery logs its own failure.
      }
    },
    take(email: string): string | undefined {
      const key = email.toLowerCase();
      const url = links.get(key);
      links.delete(key);
      return url;
    },
  };
}
