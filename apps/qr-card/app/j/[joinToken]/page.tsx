import { headers } from "next/headers";
import { pickLocale } from "../../../lib/locale";
import { JoinApp } from "./join-app";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ joinToken: string }> }) {
  const { joinToken } = await params;
  const locale = pickLocale((await headers()).get("accept-language"));
  return <JoinApp joinToken={joinToken} locale={locale} />;
}
