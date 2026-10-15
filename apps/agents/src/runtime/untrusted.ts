// apps/agents/src/runtime/untrusted.ts
/**
 * Text a third party wrote, quoted as data. The tag cannot be closed from inside: any copy of it
 * in the text is removed first. Every task that sends a guest's words to a model goes through here.
 */
export function untrusted(tag: string, text: string | null): string {
  if (!/^[a-z_]+$/.test(tag)) throw new Error(`not a usable tag name: ${tag}`);
  const pattern = new RegExp(`<\\s*/?\\s*${tag}\\s*>`, "gi");
  // Removing one copy can join the pieces around it into another, so repeat until nothing changes.
  let clean = text ?? "";
  for (let next = clean.replace(pattern, ""); next !== clean; next = clean.replace(pattern, "")) {
    clean = next;
  }
  return `<${tag}>\n${clean}\n</${tag}>`;
}
