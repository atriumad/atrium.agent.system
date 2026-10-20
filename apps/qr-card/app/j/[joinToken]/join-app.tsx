"use client";

import { CARD_COPY, JoinStateScreen } from "@atrium/ui";
import { useEffect, useState } from "react";
import { browserStore } from "../../../lib/browser-store";
import { type JoinOutcome, startJoin } from "../../../lib/join";
import type { CardLocale } from "../../../lib/locale";

export function JoinApp({ joinToken, locale }: { joinToken: string; locale: CardLocale }) {
  const copy = CARD_COPY[locale];
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null);

  useEffect(() => {
    let live = true;
    void startJoin(joinToken, { store: browserStore() }).then((result) => {
      if (!live) return;
      // replace, so /j/ stays out of history; the token lives only in the /c/ path.
      if (result.kind === "card") window.location.replace(`/c/${result.token}`);
      else setOutcome(result);
    });
    return () => {
      live = false;
    };
  }, [joinToken]);

  if (!outcome) return <JoinStateScreen title={copy.joining} body="" />;
  switch (outcome.kind) {
    case "paused":
      return <JoinStateScreen title={copy.pausedTitle} body={copy.pausedBody} />;
    case "device_limit":
      return <JoinStateScreen title={copy.deviceTitle} body={copy.deviceBody} />;
    case "rate_limited":
      return <JoinStateScreen title={copy.limitedTitle} body={copy.limitedBody} />;
    case "error":
      return <JoinStateScreen title={copy.errorTitle} body={copy.errorBody} />;
    default:
      return <JoinStateScreen title={copy.invalidTitle} body={copy.invalidBody} />;
  }
}
