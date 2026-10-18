import { useRef, useState } from "react";
import { cx } from "../lib/cx";

export type TrendPoint = { date: string; average: number | null; count: number };

export type TrendChartProps = {
  points: TrendPoint[];
  label: string;
  min?: number;
  max?: number;
  className?: string;
};

const W = 640;
const H = 220;
const PAD = { l: 34, r: 8, t: 10, b: 24 };

/** A daily average line (broken where there is no average) over quiet volume bars. */
export function TrendChart({ points, label, min = 3, max = 5, className }: TrendChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const slider = useRef<HTMLInputElement>(null);
  const valid = points.filter((p) => p.average !== null);
  if (valid.length < 2) {
    return <p className="text-sm text-fg-muted">Too few answers to draw a trend</p>;
  }
  const first = valid[0]?.average;
  const last = valid.at(-1)?.average;
  const answers = points.reduce((s, p) => s + p.count, 0);
  const n = points.length;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) =>
    PAD.t + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * innerH;
  const maxCount = Math.max(...points.map((p) => p.count), 1);
  const barW = Math.max(2, (innerW / n) * 0.6);

  const segments: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.average === null) {
      if (run.length) segments.push(run.join(" "));
      // A run of one point has no line; its marker below is what draws it.
      const lines = segments.filter((s) => s.includes(" "));
      run = [];
    } else run.push(`${x(i)},${y(p.average)}`);
  });
  if (run.length) segments.push(run.join(" "));
  // A run of one point has no line; its marker below is what draws it.
  const lines = segments.filter((s) => s.includes(" "));

  const ticks = [min, (min + max) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const shownIndex = active ?? n - 1;
  const shown = points[shownIndex];
  const readout = shown
    ? `${shown.date}: ${shown.average === null ? "no average" : shown.average.toFixed(1)}, ${shown.count} answers`
    : "";

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: from ${first?.toFixed(1)} to ${last?.toFixed(1)}, ${answers} answers`}
        className="max-w-full"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (!r.width) return;
          const px = ((e.clientX - r.left) / r.width) * W;
          setActive(Math.min(n - 1, Math.max(0, Math.round(((px - PAD.l) / innerW) * (n - 1)))));
        }}
        onPointerLeave={() => {
          if (document.activeElement !== slider.current) setActive(null);
        }}
      >
        {ticks.map((t, ti) => (
          <g key={ti}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--cream-400)" />
            <text
              x={PAD.l - 6}
              y={y(t) + 4}
              fontSize="11"
              textAnchor="end"
              fill="var(--text-muted)"
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          p.count > 0 ? (
            <rect
              key={p.date}
              x={x(i) - barW / 2}
              y={H - PAD.b - (p.count / maxCount) * innerH * 0.35}
              width={barW}
              height={(p.count / maxCount) * innerH * 0.35}
              fill="var(--cream-400)"
            />
          ) : null,
        )}
        {lines.map((s) => (
          <polyline
            key={s}
            points={s}
            fill="none"
            stroke="var(--charcoal-800)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
        {points.map((p, i) =>
          p.average !== null ? (
            <circle
              key={p.date}
              cx={x(i)}
              cy={y(p.average)}
              r={i === active ? 5 : 3}
              fill={i === active ? "var(--lime-500)" : "var(--charcoal-800)"}
              stroke="var(--charcoal-800)"
            />
          ) : null,
        )}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.date}
              x={x(i)}
              y={H - 6}
              fontSize="11"
              textAnchor="middle"
              fill="var(--text-muted)"
            >
              {p.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="flex items-center gap-3">
        <input
          ref={slider}
          type="range"
          min={0}
          max={n - 1}
          value={active ?? n - 1}
          aria-label="Day"
          aria-valuetext={readout}
          onChange={(e) => setActive(Number(e.target.value))}
          onBlur={() => setActive(null)}
          className="min-w-0 flex-1"
        />
        <output className="text-sm text-fg-muted tabular-nums" aria-live="polite">
          {readout}
        </output>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Average</th>
            <th scope="col">Answers</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.average === null ? "" : p.average.toFixed(1)}</td>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
