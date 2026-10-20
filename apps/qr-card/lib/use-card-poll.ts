"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type CardStatus, type CardView, createCardPoller } from "./poll";

/** The card for `token`, kept fresh while the page is open. */
export function useCardPoll(token: string): {
  view: CardView | null;
  status: CardStatus;
  refresh: () => void;
} {
  const [view, setView] = useState<CardView | null>(null);
  const [status, setStatus] = useState<CardStatus>("loading");
  const pollerRef = useRef<ReturnType<typeof createCardPoller> | null>(null);

  useEffect(() => {
    const isVisible = () => document.visibilityState !== "hidden";
    const poller = createCardPoller({
      token,
      isVisible,
      onView: setView,
      onStatus: setStatus,
    });
    pollerRef.current = poller;
    const onVisibility = () => poller.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibility);
    poller.start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      poller.stop();
      pollerRef.current = null;
    };
  }, [token]);

  const refresh = useCallback(() => pollerRef.current?.refresh(), []);
  return { view, status, refresh };
}
