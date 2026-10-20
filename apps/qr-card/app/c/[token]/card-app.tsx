"use client";

import { CARD_COPY, type EmailResult, fill, LoyaltyCardScreen } from "@atrium/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserStore } from "../../../lib/browser-store";
import type { CardLocale } from "../../../lib/locale";
import type { CardView } from "../../../lib/poll";
import { useCardPoll } from "../../../lib/use-card-poll";

export function CardApp({ token, locale }: { token: string; locale: CardLocale }) {
  const copy = CARD_COPY[locale];
  const { view, status } = useCardPoll(token);
  const store = useMemo(() => (typeof window === "undefined" ? null : browserStore()), []);
  const [announce, setAnnounce] = useState<string | null>(null);
  const [animateIndex, setAnimateIndex] = useState<number | null>(null);
  const [emailDone, setEmailDone] = useState(false);
  const [hintHidden, setHintHidden] = useState(true);
  const previous = useRef<CardView | null>(null);

  // Browser-only facts are read after mount so the server and first client render agree.
  useEffect(() => {
    const standalone =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches;
    setHintHidden(standalone || (store?.hintDismissed() ?? false));
  }, [store]);

  useEffect(() => {
    if (view && store) setEmailDone(store.emailDone(view.shortCode));
  }, [view, store]);

  useEffect(() => {
    if (!view) return;
    const before = previous.current;
    previous.current = view;
    if (!before) return;
    if (view.rewardReady && !before.rewardReady) {
      setAnnounce(copy.readyTitle);
      setAnimateIndex(Math.max(view.stampsRequired - 1, 0));
    } else if (view.stampsInCycle > before.stampsInCycle) {
      setAnnounce(fill(copy.stampAdded, { n: view.stampsInCycle, total: view.stampsRequired }));
      setAnimateIndex(view.stampsInCycle - 1);
    }
  }, [view, copy]);

  const onEmail = useCallback(
    async (email: string): Promise<EmailResult> => {
      try {
        const res = await fetch(`/loyalty-api/cards/${token}/email`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, consent: true }),
          cache: "no-store",
        });
        if (res.status === 204) {
          if (view) store?.markEmailDone(view.shortCode);
          return "ok";
        }
        if (res.status === 400) {
          const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
          return body?.error === "invalid_email" ? "invalid_email" : "unavailable";
        }
        if (res.status === 429) return "rate_limited";
        return "unavailable";
      } catch {
        return "unavailable";
      }
    },
    [token, view, store],
  );

  return (
    <LoyaltyCardScreen
      status={status}
      view={view}
      copy={copy}
      onEmail={onEmail}
      emailDone={emailDone}
      showHint={!hintHidden}
      onDismissHint={() => {
        store?.dismissHint();
        setHintHidden(true);
      }}
      announce={announce}
      animateIndex={animateIndex}
    />
  );
}
