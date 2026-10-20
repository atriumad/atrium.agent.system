import { headers } from "next/headers";
import { pickLocale } from "../lib/locale";
import { SavedCards } from "./saved-cards";

export const dynamic = "force-dynamic";

export default async function Page() {
  const locale = pickLocale((await headers()).get("accept-language"));
  return <SavedCards locale={locale} />;
}
