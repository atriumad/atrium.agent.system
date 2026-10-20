import { CARD_COPY, JoinStateScreen } from "@atrium/ui";
import { headers } from "next/headers";
import { pickLocale } from "../lib/locale";

export default async function NotFound() {
  const copy = CARD_COPY[pickLocale((await headers()).get("accept-language"))];
  return <JoinStateScreen title={copy.notFoundTitle} body={copy.notFoundBody} />;
}
