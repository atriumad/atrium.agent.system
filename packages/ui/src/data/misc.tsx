"use client";

import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { Meter as BaseMeter } from "@base-ui/react/meter";
import { Progress as BaseProgress } from "@base-ui/react/progress";
import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";

/* ---- Avatar ---- */

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const AVATAR = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-[15px]" };

export type AvatarProps = Omit<ComponentProps<typeof BaseAvatar.Root>, "children"> & {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
};

/** A squared tile with initials; a photo replaces them. The name is the accessible name. */
export function Avatar({ name, src, size = "md", className, ...rest }: AvatarProps) {
  return (
    <BaseAvatar.Root
      role="img"
      aria-label={name}
      className={cx(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-sm bg-cream-300 font-medium tracking-wide text-charcoal-900 dark:bg-charcoal-700 dark:text-cream-200",
        AVATAR[size],
        className,
      )}
      {...rest}
    >
      {src ? <BaseAvatar.Image src={src} alt="" className="size-full object-cover" /> : null}
      <BaseAvatar.Fallback>{initials(name)}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}

export function AvatarGroup({
  people,
  max = 4,
  size = "md",
}: {
  people: { name: string; src?: string }[];
  max?: number;
  size?: "sm" | "md" | "lg";
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center" role="group" aria-label={`${people.length} people`}>
      {shown.map((p) => (
        <Avatar
          key={p.name}
          name={p.name}
          {...(p.src ? { src: p.src } : {})}
          size={size}
          className="-ml-1.5 ring-2 ring-surface-card first:ml-0"
        />
      ))}
      {rest > 0 ? <span className="ml-1.5 text-xs text-fg-muted tabular-nums">+{rest}</span> : null}
    </div>
  );
}

/* ---- Progress and meter ---- */

const FILL = {
  charcoal: "bg-charcoal-800 dark:bg-cream-200",
  lime: "bg-lime-600",
  clay: "bg-clay-500",
};

export type ProgressProps = Omit<ComponentProps<typeof BaseProgress.Root>, "children"> & {
  label: string;
  tone?: keyof typeof FILL;
  showValue?: boolean;
};

/** Progress always has a label, and the number beside it when it helps: never only the bar. */
export function Progress({
  label,
  tone = "charcoal",
  showValue,
  className,
  ...rest
}: ProgressProps) {
  return (
    <BaseProgress.Root className={cx("flex flex-col gap-1.5", className)} {...rest}>
      <div className="flex items-baseline justify-between">
        <BaseProgress.Label className="text-sm">{label}</BaseProgress.Label>
        {showValue ? <BaseProgress.Value className="text-xs text-fg-muted tabular-nums" /> : null}
      </div>
      <BaseProgress.Track className="h-1.5 overflow-hidden rounded-xs bg-surface-sunken">
        <BaseProgress.Indicator
          className={cx("h-full transition-[width] duration-(--dur-slow) ease-out", FILL[tone])}
        />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}

export type MeterProps = Omit<ComponentProps<typeof BaseMeter.Root>, "children"> & {
  label: string;
};

/** A value inside a known range (a score, a budget used), as opposed to progress toward done. */
export function Meter({ label, className, ...rest }: MeterProps) {
  return (
    <BaseMeter.Root className={cx("flex flex-col gap-1.5", className)} {...rest}>
      <div className="flex items-baseline justify-between">
        <BaseMeter.Label className="text-sm">{label}</BaseMeter.Label>
        <BaseMeter.Value className="text-xs text-fg-muted tabular-nums" />
      </div>
      <BaseMeter.Track className="h-1.5 overflow-hidden rounded-xs bg-surface-sunken">
        <BaseMeter.Indicator className="h-full bg-charcoal-800 dark:bg-cream-200" />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}

/* ---- Skeleton ---- */

/** The shape of what is coming, for anything bigger than a button. It stops shimmering with reduced motion. */
export function Skeleton({ className, ...rest }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block h-3.5 w-full animate-pulse rounded-xs bg-surface-sunken motion-reduce:animate-none",
        className,
      )}
      {...rest}
    />
  );
}

/* ---- Accordion ---- */

export type AccordionItem = { value: string; title: ReactNode; content: ReactNode };

/** Disclosure for secondary detail: caps-weight rows on hairlines, one or several open. */
export function Accordion({
  items,
  className,
  ...rest
}: Omit<ComponentProps<typeof BaseAccordion.Root>, "children"> & { items: AccordionItem[] }) {
  return (
    <BaseAccordion.Root className={cx("border-t-[3px] border-rule", className)} {...rest}>
      {items.map((it) => (
        <BaseAccordion.Item key={it.value} value={it.value} className="border-b border-line">
          <BaseAccordion.Header className="m-0">
            <BaseAccordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left text-base">
              {it.title}
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                className="shrink-0 transition-transform duration-(--dur-base) group-data-panel-open:rotate-180"
                aria-hidden="true"
              />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className="pb-4 text-sm text-fg-muted">
            {it.content}
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  );
}

/* ---- Description list and timeline ---- */

/** Label and value pairs: a case, a client, a location. Labels are the wide-caps label. */
export function DescriptionList({
  items,
  className,
}: {
  items: { term: string; detail: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cx("m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm", className)}>
      {items.map((i) => (
        <div key={i.term} className="contents">
          <dt className="label-caps self-center text-fg-muted">{i.term}</dt>
          <dd className="m-0">{i.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export type TimelineItem = {
  id: string;
  title: ReactNode;
  time: string;
  detail?: ReactNode;
  tone?: "ink" | "lime" | "clay";
};
const DOT = { ink: "bg-charcoal-800 dark:bg-cream-200", lime: "bg-lime-600", clay: "bg-clay-500" };

/** What happened, in order: a case opened, contacted, resolved. Newest first, with a mark on a hairline. */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cx("m-0 list-none border-l border-line p-0", className)}>
      {items.map((i) => (
        <li key={i.id} className="relative pb-5 pl-5 last:pb-0">
          <span
            aria-hidden="true"
            className={cx("absolute top-1.5 -left-[4.5px] size-2 rounded-xs", DOT[i.tone ?? "ink"])}
          />
          <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="text-fg-strong">{i.title}</span>
            <time className="label-caps text-fg-muted">{i.time}</time>
          </div>
          {i.detail ? <div className="mt-1 text-sm text-fg-muted">{i.detail}</div> : null}
        </li>
      ))}
    </ol>
  );
}
