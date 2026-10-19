"use client";

import type { ResponsesBand } from "./api";
import { type KpiState, KpiTile } from "./data/kpi-tile";
import { RatingBars } from "./data/rating-bars";
import { SectionBand } from "./data/section-page";

const pct = (v: number) => Math.round(v * 100);

/** Tiles share the band's height; the label sits on top and the figure and notes settle below it. */
const TILE = "justify-between";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-card border border-frame bg-surface-card p-4">
      <h2 className="label-caps m-0 text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

/** A tile's state: no figure is "none", a figure from too few answers says how few. */
function stateOf(value: number | null, small: boolean, n: number): KpiState {
  if (value === null) return "none";
  return small ? { tooFew: n } : "ok";
}

/** The summary band of the Responses page: four figures and the rating distribution. */
export function ResponsesBandView({
  band,
  state,
  onRetry,
}: {
  band: ResponsesBand | null;
  state: "loading" | "error" | "ok";
  onRetry: () => void;
}) {
  let tiles: React.ReactNode = null;
  let aside: React.ReactNode = null;
  if (band) {
    const { responses, rating, negativeShare: neg, reviewClicks: clicks } = band;
    const negState: KpiState =
      neg.read === 0 || neg.value === null ? "none" : neg.small ? { tooFew: neg.read } : "ok";
    const clickState: KpiState =
      clicks.answers === 0 ? "none" : clicks.small ? { tooFew: clicks.answers } : "ok";
    tiles = (
      <>
        <KpiTile
          className={TILE}
          label="Responses"
          value={responses.value ?? "—"}
          state={stateOf(responses.value, responses.small, responses.n)}
          tone="lime"
          {...(responses.change !== null
            ? { delta: responses.change, deltaUnit: "%" as const }
            : {})}
          spark={responses.spark}
          sparkLabel="Responses per day"
        />
        <KpiTile
          className={TILE}
          label="Average rating"
          value={rating.value === null ? "—" : rating.value.toFixed(1)}
          unit="/ 5"
          state={stateOf(rating.value, rating.small, rating.n)}
          {...(rating.change !== null ? { delta: rating.change, deltaUnit: "pts" as const } : {})}
          spark={rating.spark}
          sparkLabel="Average rating per day"
        />
        <KpiTile
          className={TILE}
          label="Negative share"
          value={neg.value === null ? "—" : pct(neg.value)}
          {...(neg.value === null ? {} : { unit: "%" })}
          state={negState}
          goodWhen="down"
          note={`of ${neg.read} answers that were read`}
          {...(neg.change !== null && negState === "ok"
            ? { delta: neg.change, deltaUnit: "pts" as const }
            : {})}
        />
        <KpiTile
          className={TILE}
          label="Review link clicks"
          value={clicks.clicks}
          state={clickState}
          note={
            clicks.rate === null
              ? `of all ${clicks.answers} answers`
              : `${pct(clicks.rate)}% of all ${clicks.answers} answers`
          }
          {...(clicks.change !== null && clickState === "ok"
            ? { delta: clicks.change, deltaUnit: "pts" as const }
            : {})}
        />
      </>
    );
    aside = (
      <Block title="Rating distribution">
        <RatingBars
          counts={band.distribution}
          label="Rating distribution"
          className="flex-1 justify-around"
        />
      </Block>
    );
  }
  return (
    <SectionBand
      state={state}
      onRetry={onRetry}
      title="Responses summary"
      tiles={tiles}
      aside={aside}
    />
  );
}
