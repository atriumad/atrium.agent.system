import { headers } from "next/headers";
import { pickLocale } from "../../../lib/locale";
import { CardApp } from "./card-app";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = pickLocale((await headers()).get("accept-language"));
  return <CardApp token={token} locale={locale} />;
}
