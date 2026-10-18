"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";

export type TrendPoint = { date: string; average: number | null; count: number };

export type TrendChartProps = {
  points: TrendPoint[];
  label: string;
  min?: number;
  max?: number;
  className?: string;
};

const DEFAULT = { w: 640, h: 220 };
const PAD = { l: 34, r: 8, t: 10, b: 24 };

/** A daily average line (broken where there is no average) over quiet volume bars. It fills the room its parent gives it. */
export function TrendChart({ points, label, min: minProp, max = 5, className }: TrendChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [announced, setAnnounced] = useState("");
  const [size, setSize] = useState(DEFAULT);
  const box = useRef<HTMLDivElement>(null);
  const valid = points.filter((p) => p.average !== null);
  const enough = valid.length >= 2;

  // Draw at the measured size, so text and circles are never stretched.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enough]);

  if (!enough) {
    return <p className="text-sm text-fg-muted">Too few answers to draw a trend</p>;
  }
  const { w: W, h: H } = size;
  // Without an explicit axis, it reaches down to the lowest day (never under 1), so a bad day is drawn where it is.
  const lowest = Math.min(...valid.map((p) => p.average ?? max));
  const min = minProp ?? Math.max(1, Math.min(3, Math.floor(lowest)));
  const first = valid[0]?.average;
  const last = valid.at(-1)?.average;
  const answers = points.reduce((s, p) => s + p.count, 0);
  const n = points.length;
  const innerW = Math.max(1, W - PAD.l - PAD.r);
  const innerH = Math.max(1, H - PAD.t - PAD.b);
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
      run = [];
    } else run.push(`${x(i)},${y(p.average)}`);
  });
  if (run.length) segments.push(run.join(" "));
  // A run of one point has no line; its marker below is what draws it.
  const lines = segments.filter((s) => s.includes(" "));

  const ticks = [min, (min + max) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const shown = active === null ? null : points[active];
  const describe = (i: number) => {
    const p = points[i];
    return p
      ? `${p.date}: ${p.average === null ? "no answers" : `${p.average.toFixed(1)}, ${p.count} answers`}`
      : "";
  };
  const readout = active === null ? "" : describe(active);
  const tipX = shown && active !== null ? Math.min(W - 70, Math.max(70, x(active))) : 0;
  const tipY = shown?.average != null ? y(shown.average) : H / 2;

  const onKey = (e: React.KeyboardEvent) => {
    const at = active ?? n - 1;
    const next =
      e.key === "ArrowRight"
        ? Math.min(n - 1, active === null ? n - 1 : at + 1)
        : e.key === "ArrowLeft"
          ? Math.max(0, active === null ? n - 1 : at - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      setAnnounced(describe(next));
    } else if (e.key === "Escape") {
      setActive(null);
      setAnnounced("");
    }
  };

  return (
    <div className={cx("flex min-h-56 flex-1 flex-col", className)}>
      <div
        ref={box}
        role="group"
        tabIndex={0}
        aria-label={`${label}: use the left and right arrow keys to read each day`}
        className="relative min-h-56 flex-1 rounded-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onKeyDown={onKey}
        onBlur={() => {
          setActive(null);
          setAnnounced("");
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (!r.width) return;
          const px = e.clientX - r.left;
          setActive(Math.min(n - 1, Math.max(0, Math.round(((px - PAD.l) / innerW) * (n - 1)))));
        }}
        onPointerLeave={() => {
          if (document.activeElement !== box.current) setActive(null);
        }}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${label}: from ${first?.toFixed(1)} to ${last?.toFixed(1)}, ${answers} answers`}
          className="absolute inset-0 max-w-full"
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
        {shown ? (
          <div
            data-tooltip=""
            aria-hidden="true"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-card border border-frame bg-surface-card px-2 py-1 text-xs text-fg-strong tabular-nums"
            style={{ left: tipX, top: Math.max(tipY - 10, 24) }}
          >
            {readout}
          </div>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite" data-live="">
        {announced}
      </span>
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
