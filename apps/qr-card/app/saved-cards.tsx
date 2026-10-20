"use client";

import { CARD_COPY } from "@atrium/ui";
import { useEffect, useState } from "react";
import { browserStore } from "../lib/browser-store";
import type { CardLocale } from "../lib/locale";
import { fetchCard } from "../lib/poll";

type Saved = { programId: string; token: string };

export function SavedCards({ locale }: { locale: CardLocale }) {
  const copy = CARD_COPY[locale];
  const [cards, setCards] = useState<Saved[] | null>(null);

  useEffect(() => {
    const store = browserStore();
    const saved = store.list();
    setCards(saved);
    let live = true;
    // A token the API no longer knows is dropped from the list and forgotten.
    for (const card of saved) {
      void fetchCard(card.token, null).then((res) => {
        if (!live || res.kind !== "not_found") return;
        store.forget(card.programId);
        setCards((now) => now?.filter((c) => c.programId !== card.programId) ?? null);
      });
    }
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-6 px-4 py-8">
      <h1 className="m-0 font-serif text-3xl leading-tight">{copy.savedTitle}</h1>
      {cards === null ? null : cards.length === 0 ? (
        <p className="m-0 text-fg-body">{copy.savedNone}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {cards.map((card) => (
            <li key={card.programId}>
              <a
                href={`/c/${card.token}`}
                className="block rounded-card border border-charcoal-800 p-4 underline"
              >
                {copy.savedOpen}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
