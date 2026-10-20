/**
 * The short code of a loyalty card. A deliberate copy of `modules/crm/domain/tokens.ts`
 * (alphabet, length and format): packages/ui cannot import a module. Keep the two in step.
 */

/** No 0, O, 1, I or L. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export function formatCardCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeCardCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[-\s]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) if (!ALPHABET.includes(char)) return null;
  return code;
}

/** What a scanner or a text box hands over: only a bare code, never a URL or a sentence. */
export function parseScannedCode(raw: string): string | null {
  return normalizeCardCode(raw.trim());
}
