import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

const SERIES = [
  "var(--data-1)",
  "var(--data-2)",
  "var(--data-3)",
  "var(--data-4)",
  "var(--data-5)",
  "var(--data-6)",
];

export type SparklineProps = Omit<ComponentProps<"svg">, "values"> & {
  values: number[];
  /** Describes the trend for a screen reader. Required: a chart has a text alternative. */
  label: string;
  width?: number;
  height?: number;
};

/** A line with the latest point in clay. */
export function Sparkline({
  values,
  label,
  width = 120,
  height = 32,
  className,
  ...rest
}: SparklineProps) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map(
    (v, i) =>
      [
        (i / Math.max(values.length - 1, 1)) * width,
        height - 3 - ((v - min) / (max - min || 1)) * (height - 6),
      ] as const,
  );
  const last = pts.at(-1) ?? [0, 0];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className={className}
      {...rest}
    >
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={SERIES[0]}
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill="var(--clay-500)" />
    </svg>
  );
}

export type BarChartProps = Omit<ComponentProps<"svg">, "values"> & {
  data: { label: string; value: number }[];
  height?: number;
  /** A sentence that states the point. The values are appended for a screen reader. */
  label?: string;
};

/** Bars start at zero, are squared, and carry a text alternative that lists every value. */
export function BarChart({
  data,
  height = 120,
  label = "Bar chart",
  className,
  ...rest
}: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 28;
  const gap = 12;
  return (
    <svg
      width={data.length * (w + gap)}
      height={height + 22}
      role="img"
      aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
      className={className}
      {...rest}
    >
      {data.map((d, i) => {
        const h = (d.value / max) * height;
        return (
          <g key={d.label} transform={`translate(${i * (w + gap)} 0)`}>
            <rect x="0" y={height - h} width={w} height={h} fill={SERIES[0]} />
            <text
              x={w / 2}
              y={height + 16}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type LineSeries = { name: string; values: number[] };
export type LineChartProps = Omit<ComponentProps<"svg">, "values"> & {
  series: LineSeries[];
  labels: string[];
  width?: number;
  height?: number;
  label?: string;
};

/** Up to six series from the data palette. Each line is also labelled at its end, so color is never the only key. */
export function LineChart({
  series,
  labels,
  width = 480,
  height = 180,
  label = "Line chart",
  className,
  ...rest
}: LineChartProps) {
  const all = series.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  const max = Math.max(...all, 1);
  const pad = { l: 8, r: 80, t: 8, b: 22 };
  const x = (i: number) => pad.l + (i / Math.max(labels.length - 1, 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  const summary = series.map((s) => `${s.name}: ${s.values.join(", ")}`).join("; ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}. ${labels.join(", ")}. ${summary}`}
      className={cx("max-w-full", className)}
      {...rest}
    >
      <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border-light)" />
      {series.slice(0, 6).map((s, k) => (
        <g key={s.name}>
          <polyline
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={SERIES[k]}
            strokeWidth="2"
          />
          <text
            x={width - pad.r + 8}
            y={y(s.values.at(-1) ?? 0) + 4}
            fontSize="11"
            fill="var(--text-body)"
          >
            {s.name}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        i % Math.ceil(labels.length / 6) === 0 ? (
          <text
            key={l}
            x={x(i)}
            y={height - 6}
            fontSize="11"
            textAnchor="middle"
            fill="var(--text-muted)"
          >
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export type ScoreRingProps = Omit<ComponentProps<"svg">, "values"> & {
  value: number;
  label: string;
  size?: number;
};

/** The Growth Score: a charcoal arc on a cream track, the figure in the serif. */
export function ScoreRing({ value, label, size = 120, className, ...rest }: ScoreRingProps) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label}: ${v} of 100`}
      className={className}
      {...rest}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--surface-sunken)"
        strokeWidth="10"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--text-strong)"
        strokeWidth="10"
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-serif)"
        fontSize={size * 0.38}
        fill="var(--text-strong)"
      >
        {v}
      </text>
    </svg>
  );
}
