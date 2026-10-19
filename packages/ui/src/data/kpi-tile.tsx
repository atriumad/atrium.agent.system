import { Fragment, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { Sparkline } from "./charts";
import { Delta } from "./delta";

export type KpiState = "ok" | { tooFew: number } | "none";

export type KpiTileProps = {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number;
  deltaUnit?: "%" | "pts";
  goodWhen?: "up" | "down";
  note?: string;
  spark?: number[];
  sparkLabel?: string;
  href?: string;
  state: KpiState;
  /** What the "too few" note counts: "answers" by default, "cases" for a count of cases. */
  tooFewLabel?: string;
  /** `lime` washes the tile; use it on one tile per view. */
  tone?: "default" | "lime";
  className?: string;
};

const DURATION = /^(\d+h)?( ?\d+m)?$/;
const UNIT_WORDS = { h: "hour", m: "minute" } as const;

/**
 * `11h 43m` as one figure: large serif digits, each unit right after its number (same baseline,
 * small muted italic serif letters), and the two number-and-unit pairs are set apart. Read aloud as "11 hours 43 minutes".
 * Anything that is not a duration is left as it is.
 */
function Duration({ text }: { text: string }) {
  const pairs = [...text.matchAll(/(\d+)([hm])/g)];
  if (pairs.length === 0) return <>{text}</>;
  const spoken = pairs
    .map(([, n, u]) => `${n} ${UNIT_WORDS[u as "h" | "m"]}${n === "1" ? "" : "s"}`)
    .join(" ");
  return (
    <span role="img" aria-label={spoken} className="inline-flex items-baseline gap-x-3">
      {pairs.map(([, n, u], i) => (
        <Fragment key={u}>
          {i > 0 ? " " : null}
          <span aria-hidden="true" className="inline-flex items-baseline gap-x-0.5">
            {n}
            <span className="font-serif text-2xl font-normal text-fg-muted italic 2xl:text-3xl">
              {u}
            </span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** A figure tile: caps label, serif figure, and either its change and trend or the reason there is none. */
export function KpiTile({
  label,
  value,
  unit,
  delta,
  deltaUnit,
  goodWhen,
  note,
  spark,
  sparkLabel,
  href,
  state,
  tooFewLabel = "answers",
  tone = "default",
  className,
}: KpiTileProps) {
  const ok = state === "ok";
  const cls = cx(
    "flex flex-col gap-2 rounded-card border border-frame p-5",
    tone === "lime" ? "bg-lime-300 dark:bg-charcoal-700" : "bg-surface-card",
    href && "no-underline transition-colors hover:border-line focus-visible:outline-2",
    className,
  );
  const body = (
    <>
      <span className="label-caps text-fg-muted">{label}</span>
      <div className="flex flex-1 flex-col justify-center gap-2">
        <span
          className={cx(
            "flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 text-4xl leading-[0.9] tracking-tight text-fg-strong tabular-nums 2xl:text-5xl dark:text-lime-500",
            "font-serif font-normal",
          )}
        >
          {typeof value === "string" && DURATION.test(value) ? <Duration text={value} /> : value}
          {unit ? (
            <span className="font-sans text-sm tracking-normal text-fg-muted">{unit}</span>
          ) : null}
          {ok && delta !== undefined ? (
            <Delta value={delta} goodWhen={goodWhen} unit={deltaUnit} />
          ) : null}
        </span>
        {ok && spark ? <Sparkline values={spark} label={sparkLabel ?? `${label} trend`} /> : null}
        {typeof state === "object" ? (
          <span className="text-xs text-fg-muted">
            Too few {tooFewLabel} ({state.tooFew})
          </span>
        ) : state === "none" ? (
          <span className="text-xs text-fg-muted">No data yet</span>
        ) : null}
      </div>
      {note ? <span className="text-xs text-fg-muted">{note}</span> : null}
    </>
  );
  return href ? (
    <a href={href} className={cx(cls, "text-inherit")}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
