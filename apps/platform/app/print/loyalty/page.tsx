import { LoyaltyPrintPage } from "@atrium/ui";

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The printable sheet sits outside the `(app)` frame: nothing but the sheet and its toolbar. */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
  const format = first(q.format) === "cards" ? "cards" : "poster";
  const lang = first(q.lang) === "es" ? "es" : "en";
  return <LoyaltyPrintPage locationId={first(q.locationId) ?? ""} format={format} lang={lang} />;
}
