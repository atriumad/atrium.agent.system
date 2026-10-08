/**
 * Holds the one-time set-password link Better Auth builds for a new owner, long enough for the
 * approver to read it back. Real email delivery can later be added next to `onPasswordSetup`.
 */
export type SetupLinkCapture = ReturnType<typeof createSetupLinkCapture>;

export function createSetupLinkCapture() {
  const links = new Map<string, string>();
  return {
    onPasswordSetup: async ({ email, url }: { email: string; url: string }) => {
      links.set(email.toLowerCase(), url);
    },
    take(email: string): string | undefined {
      const key = email.toLowerCase();
      const url = links.get(key);
      links.delete(key);
      return url;
    },
  };
}
