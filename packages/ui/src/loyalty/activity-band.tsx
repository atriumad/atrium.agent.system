"use client";

import type { LoyaltySummary, LoyaltyTile } from "../api";
import { KpiTile } from "../data/kpi-tile";
import { SectionBand } from "../data/section-page";

/** Tiles share the band's height; the label sits on top and the figure and notes settle below it. */
const TILE = "justify-between";
const SMALL_NOTE = "change shows from 10 a window";

/** A change only where there is one; a null change draws no delta at all. */
const deltaOf = (t: LoyaltyTile) =>
  t.change !== null ? { delta: t.change, deltaUnit: "%" as const } : {};

/** The note under a tile: its own words, then the small-sample one when the window is thin. */
const noteOf = (t: LoyaltyTile, own?: string) => {
  const parts = [own, t.small ? SMALL_NOTE : undefined].filter(Boolean);
  return parts.length ? { note: parts.join(" · ") } : {};
};

/** The summary band of the loyalty activity page: four tiles and the redeemed figure beside them. */
export function LoyaltyBandView({
  band,
  state,
  onRetry,
}: {
  band: LoyaltySummary | null;
  state: "loading" | "error" | "ok";
  onRetry: () => void;
}) {
  let tiles: React.ReactNode = null;
  let aside: React.ReactNode = null;
  if (band) {
    const { cardsIssued, activeCards, stamps, rewardsEarned, rewardsRedeemed } = band;
    tiles = (
      <>
        <KpiTile
          className={TILE}
          label="Cards issued"
          value={cardsIssued.value}
          state="ok"
          tone="lime"
          {...deltaOf(cardsIssued)}
          {...noteOf(cardsIssued)}
        />
        <KpiTile
          className={TILE}
          label="Active cards"
          value={activeCards.value}
          state="ok"
          {...deltaOf(activeCards)}
          {...noteOf(activeCards, "stamped in the range")}
        />
        <KpiTile
          className={TILE}
          label="Stamps"
          value={stamps.value}
          state="ok"
          {...deltaOf(stamps)}
          {...noteOf(stamps)}
        />
        <KpiTile
          className={TILE}
          label="Rewards earned"
          value={rewardsEarned.value}
          state="ok"
          {...deltaOf(rewardsEarned)}
          {...noteOf(rewardsEarned)}
        />
      </>
    );
    aside = (
      <section className="col-span-full flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-2 rounded-card border border-frame bg-surface-card p-4">
        <h2 className="label-caps m-0 text-fg-muted">Rewards redeemed</h2>
        <p className="m-0 flex flex-wrap items-baseline gap-x-2.5 font-serif text-4xl leading-[0.9] tracking-tight text-fg-strong tabular-nums 2xl:text-5xl dark:text-lime-500">
          {rewardsRedeemed.value}
          <span className="text-2xl font-normal text-fg-muted italic">
            of {rewardsEarned.value} earned
          </span>
        </p>
      </section>
    );
  }
  return (
    <SectionBand
      state={state}
      onRetry={onRetry}
      title="Loyalty summary"
      tiles={tiles}
      aside={aside}
    />
  );
}
