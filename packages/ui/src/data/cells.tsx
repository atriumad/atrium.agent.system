import { Check, Minus, TriangleAlert } from "lucide-react";
import { cx } from "../lib/cx";
import { humaniseTopic } from "./split-bars";

const PILL =
  "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-medium tracking-[0.06em] whitespace-nowrap uppercase";
const CLAY = "border-clay-500 bg-clay-200 text-clay-700 dark:bg-clay-500/20 dark:text-clay-300";
const LIME = "border-lime-500 bg-lime-100 text-fg-strong dark:bg-lime-500/10 dark:text-lime-500";
const QUIET = "border-line bg-surface-sunken text-fg-muted";
const INK =
  "border-charcoal-800 bg-charcoal-800 text-cream-200 dark:border-cream-300 dark:bg-cream-300 dark:text-charcoal-900";

/** A rating as text: `★★☆☆☆`, read as "2 of 5". Clamped to 1 to 5. */
export function Stars({ rating }: { rating: number }) {
  const n = Math.min(5, Math.max(1, Math.round(Number.isFinite(rating) ? rating : 1)));
  return (
    <span role="img" aria-label={`${n} of 5`} className="tracking-[1px] whitespace-nowrap">
      {"★".repeat(n)}
      {"☆".repeat(5 - n)}
    </span>
  );
}

const dash = <span className="text-fg-muted">—</span>;

/** Up to two topic chips and the rest as `+N`. */
export function TopicChips({ topics }: { topics: string[] | null }) {
  if (!topics || topics.length === 0) return dash;
  const rest = topics.length - 2;
  return (
    <span className="inline-flex items-center gap-1">
      {topics.slice(0, 2).map((t) => (
        <span
          key={t}
          className="rounded-full border border-line bg-surface-page px-2 text-[11.5px] whitespace-nowrap"
        >
          {humaniseTopic(t)}
        </span>
      ))}
      {rest > 0 ? <span className="text-xs text-fg-muted">+{rest}</span> : null}
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function relative(from: Date, now: Date): string {
  const secs = Math.round((now.getTime() - from.getTime()) / 1000);
  const abs = Math.abs(secs);
  const [n, unit] =
    abs < 60
      ? [abs, "second"]
      : abs < 3600
        ? [Math.round(abs / 60), "minute"]
        : abs < 86400
          ? [Math.round(abs / 3600), "hour"]
          : [Math.round(abs / 86400), "day"];
  const text = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return secs >= 0 ? `${text} ago` : `in ${text}`;
}

/** `Oct 18, 9:40` in the viewer's time zone, with how long ago in the title. */
export function When({ date, now }: { date: string; now: Date }) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return dash;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return (
    <time dateTime={d.toISOString()} title={relative(d, now)} className="whitespace-nowrap">
      {`${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours()}:${mm}`}
    </time>
  );
}

/** High is clay, medium is ink, low is quiet. Always a word and a mark. */
export function SeverityPill({ severity }: { severity: string }) {
  const high = severity === "high";
  const medium = severity === "medium";
  const Mark = high ? TriangleAlert : medium ? Check : Minus;
  return (
    <span className={cx(PILL, high ? CLAY : medium ? INK : QUIET)}>
      <Mark size={11} strokeWidth={1.5} aria-hidden="true" />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

/** Positive is lime wash, negative clay, mixed quiet, none a dash. */
export function SentimentPill({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return dash;
  const positive = sentiment === "positive";
  const negative = sentiment === "negative";
  const Mark = positive ? Check : negative ? TriangleAlert : Minus;
  return (
    <span className={cx(PILL, positive ? LIME : negative ? CLAY : QUIET)}>
      <Mark size={11} strokeWidth={1.5} aria-hidden="true" />
      {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
    </span>
  );
}
