export type CardLocale = "en" | "es";

/** The first of Spanish and English the browser prefers by q-value; English otherwise. */
export function pickLocale(acceptLanguage: string | null): CardLocale {
  if (!acceptLanguage) return "en";
  const entries = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return {
        lang: tag.trim().toLowerCase().split("-")[0] ?? "",
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((e) => e.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  const hit = entries.find((e) => e.lang === "es" || e.lang === "en");
  return hit?.lang === "es" ? "es" : "en";
}
