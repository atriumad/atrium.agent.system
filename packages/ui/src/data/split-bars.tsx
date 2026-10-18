import { cx } from "../lib/cx";

export type SplitRow = {
  topic: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
};

export type SplitBarsProps = {
  rows: SplitRow[];
  /** One line under the list that says how to read it. */
  hint: string;
  /** Shown when no row has answers. */
  empty: string;
  href?: (topic: string) => string;
  className?: string;
};

/** `wait-time` to `Wait time`. */
export function humaniseTopic(slug: string): string {
  const text = slug.replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Each share is rounded on its own, so the three can add to 99 or 101; the bar widths are exact. All 0 when the parts are empty. */
function shares(parts: number[]): number[] {
  const sum = parts.reduce((a, b) => a + b, 0);
  return parts.map((p) => (sum > 0 ? Math.round((p / sum) * 100) : 0));
}

/** Topics as stacked bars: positive lime with an ink outline, neutral cream line, negative clay. The share is also written out. */
export function SplitBars({ rows, hint, empty, href, className }: SplitBarsProps) {
  const shown = rows.filter((r) => r.total > 0);
  if (shown.length === 0) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((r) => {
          const sum = r.positive + r.neutral + r.negative || 1;
          const name = humaniseTopic(r.topic);
          const [pp, pn, pg] = shares([r.positive, r.neutral, r.negative]);
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-fg-strong">{name}</span>
                <span className="text-sm text-fg-muted tabular-nums">{r.total}</span>
              </span>
              <span className="flex h-3 w-full overflow-hidden rounded-sm border border-frame">
                <span
                  data-segment="positive"
                  style={{ width: `${(r.positive / sum) * 100}%`, background: "var(--lime-500)" }}
                />
                <span
                  data-segment="neutral"
                  style={{ width: `${(r.neutral / sum) * 100}%`, background: "var(--cream-400)" }}
                />
                <span
                  data-segment="negative"
                  style={{ width: `${(r.negative / sum) * 100}%`, background: "var(--clay-500)" }}
                />
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs text-fg-muted tabular-nums">
                <span>{pp}% positive</span>
                <span>{pn}% neutral</span>
                <span>{pg}% negative</span>
              </span>
            </>
          );
          return (
            <li key={r.topic}>
              {href ? (
                <a
                  href={href(r.topic)}
                  className="flex flex-col gap-1 text-inherit no-underline hover:underline"
                >
                  {body}
                </a>
              ) : (
                <div className="flex flex-col gap-1">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-xs text-fg-muted">{hint}</p>
    </div>
  );
}
