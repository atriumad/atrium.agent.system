"use client";

import type { CasesBand, RangeKey } from "./api";
import { DailyBars } from "./data/daily-bars";
import { KpiTile } from "./data/kpi-tile";
import { SectionBand } from "./data/section-page";
import { duration } from "./format";

const DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
const pct = (v: number) => Math.round(v * 100);
const hoursText = (h: number) => duration(h * 3_600_000);

/** Tiles share the band's height; the label sits on top and the figure and notes settle below it. */
const TILE = "justify-between";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-card border border-frame bg-surface-card p-3">
      <h2 className="label-caps m-0 text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

/** The summary band of the Cases page: four figures, cases opened per day, and the severity split. */
export function CasesBandView({
  band,
  state,
  onRetry,
  range,
}: {
  band: CasesBand | null;
  state: "loading" | "error" | "ok";
  onRetry: () => void;
  range: RangeKey;
}) {
  const days = DAYS[range];
  let tiles: React.ReactNode = null;
  let aside: React.ReactNode = null;
  if (band) {
    const c = band.contact;
    const parts = [
      "Target 24h",
      c.insideTarget !== null ? `${pct(c.insideTarget)}% inside target` : null,
      c.change !== null && Math.round(Math.abs(c.change) * 10) > 0
        ? `${Math.round(Math.abs(c.change) * 10) / 10}h ${c.change < 0 ? "faster" : "slower"} than before`
        : null,
    ].filter(Boolean);
    const severities = (["high", "medium", "low"] as const)
      .map((s) => ({ s, n: band.bySeverity[s] }))
      .sort((a, b) => b.n - a.n);
    const top = Math.max(...severities.map((r) => r.n), 1);
    tiles = (
      <>
        <KpiTile
          className={TILE}
          label="Active"
          value={band.open}
          state="ok"
          note={`${band.overdue.value} overdue`}
          tone="lime"
        />
        <KpiTile
          className={TILE}
          label="Overdue"
          value={band.overdue.value}
          state="ok"
          goodWhen="down"
          note={`Was ${band.overdue.previous} in the previous ${days} days`}
        />
        <KpiTile
          className={TILE}
          label="Median time to contact"
          value={c.medianHours === null ? "—" : hoursText(c.medianHours)}
          figureFont="sans"
          state={c.medianHours === null ? "none" : c.small ? { tooFew: c.cases } : "ok"}
          note={parts.join(" · ")}
        />
        <KpiTile
          className={TILE}
          label="Resolved"
          value={band.resolved.value}
          state={band.resolved.small ? { tooFew: band.resolved.value } : "ok"}
          {...(band.resolved.change !== null ? { delta: band.resolved.change } : {})}
        />
      </>
    );
    aside = (
      <>
        <Block title="Opened per day">
          <div className="relative min-h-16 flex-1">
            <DailyBars
              days={band.openedPerDay}
              label="Cases opened per day"
              className="absolute inset-0 size-full"
            />
          </div>
        </Block>
        <Block title="By severity">
          <ul className="m-0 flex flex-1 list-none flex-col justify-around gap-1.5 p-0">
            {severities.map(({ s, n }) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 font-medium text-fg-strong">
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
                <span className="h-2.5 min-w-0 flex-1 rounded-sm border border-frame">
                  <span
                    className="block h-full bg-charcoal-800 dark:bg-cream-300"
                    style={{ width: `${(n / top) * 100}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-fg-muted">{n}</span>
              </li>
            ))}
          </ul>
        </Block>
      </>
    );
  }
  return (
    <SectionBand
      state={state}
      onRetry={onRetry}
      title="Cases summary"
      tiles={tiles}
      aside={aside}
    />
  );
}
