import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import { Sparkline } from "./charts";
import { Delta } from "./delta";

export type StatTileProps = Omit<ComponentProps<"div">, "children"> & {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number;
  goodWhen?: "up" | "down";
  note?: string;
  trend?: number[];
};

/** A stat at product size: caps label, serif figure, unit, delta, trend and one note. One tile answers one question. */
export function StatTile({
  label,
  value,
  unit,
  delta,
  goodWhen,
  note,
  trend,
  className,
  ...rest
}: StatTileProps) {
  return (
    <div
      className={cx(
        "flex flex-col gap-2 rounded-card border border-frame bg-surface-card p-5",
        className,
      )}
      {...rest}
    >
      <span className="label-caps text-fg-muted">{label}</span>
      <span className="flex items-baseline gap-2.5 font-serif text-5xl leading-[0.9] font-normal tracking-tight text-fg-strong tabular-nums dark:text-lime-500">
        {value}
        {unit ? (
          <span className="font-sans text-sm tracking-normal text-fg-muted">{unit}</span>
        ) : null}
        {delta !== undefined ? <Delta value={delta} goodWhen={goodWhen} /> : null}
      </span>
      {trend ? <Sparkline values={trend} label={`${label} trend`} /> : null}
      {note ? <span className="text-xs text-fg-muted">{note}</span> : null}
    </div>
  );
}
