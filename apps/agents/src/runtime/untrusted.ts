// apps/agents/src/runtime/untrusted.ts
/**
 * Text a third party wrote, quoted as data. The tag cannot be closed from inside: any copy of it
 * in the text is removed first. Every task that sends a guest's words to a model goes through here.
 */
export function untrusted(tag: string, text: string | null): string {
  if (!/^[a-z_]+$/.test(tag)) throw new Error(`not a usable tag name: ${tag}`);
  const clean = (text ?? "").replaceAll(new RegExp(`</?${tag}>`, "gi"), "");
  return `<${tag}>\n${clean}\n</${tag}>`;
}
