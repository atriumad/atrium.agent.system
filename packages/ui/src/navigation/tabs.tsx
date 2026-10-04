"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ComponentProps, ReactNode } from "react";
import { chipStyles } from "../actions/chip";
import { cx } from "../lib/cx";

export type TabItem = {
  value: string;
  label: ReactNode;
  count?: number;
  content?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = Omit<ComponentProps<typeof BaseTabs.Root>, "children"> & {
  items: TabItem[];
  /** `chips` filter views of the same list; `underline` switch sections of a page. */
  variant?: "chips" | "underline";
  /** Names the tab list. */
  label: string;
};

/** Filter tabs are chips, the only pill. Section tabs are wide-caps labels with the 3px rule under the current one. */
export function Tabs({ items, variant = "chips", label, className, ...rest }: TabsProps) {
  const chips = variant === "chips";
  return (
    <BaseTabs.Root className={className} {...rest}>
      <BaseTabs.List
        aria-label={label}
        className={chips ? "flex flex-wrap gap-2" : "flex gap-6 border-b border-line"}
      >
        {items.map((t) => (
          <BaseTabs.Tab
            key={t.value}
            value={t.value}
            disabled={t.disabled}
            className={
              chips
                ? cx(
                    chipStyles({ variant: "outline" }),
                    "cursor-pointer hover:not-data-active:border-charcoal-800 data-active:border-charcoal-800 data-active:bg-charcoal-800 data-active:text-cream-200 dark:data-active:border-lime-500 dark:data-active:bg-lime-500 dark:data-active:text-charcoal-900",
                  )
                : "label-caps -mb-px cursor-pointer border-b-[3px] border-transparent py-2.5 text-fg-muted hover:text-fg-strong data-active:border-rule data-active:text-fg-strong"
            }
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="tabular-nums opacity-70">{t.count}</span>
            ) : null}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {items.map((t) =>
        t.content !== undefined ? (
          <BaseTabs.Panel key={t.value} value={t.value} className="mt-4">
            {t.content}
          </BaseTabs.Panel>
        ) : null,
      )}
    </BaseTabs.Root>
  );
}

export type SegmentedProps = Omit<ComponentProps<typeof ToggleGroup>, "children" | "multiple"> & {
  options: { value: string; label: ReactNode }[];
  label: string;
};

/** Two to four options that change how the same data is shown (a range, a view): a squared 1px ink group. */
export function Segmented({ options, label, className, ...rest }: SegmentedProps) {
  return (
    <ToggleGroup
      aria-label={label}
      className={cx(
        "inline-flex overflow-hidden rounded-sm border border-charcoal-800 dark:border-cream-300",
        className,
      )}
      {...rest}
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          className="cursor-pointer border-l border-charcoal-800 px-3.5 py-[7px] text-sm font-medium first:border-l-0 data-pressed:bg-charcoal-800 data-pressed:text-cream-200 dark:border-cream-300 dark:data-pressed:bg-cream-200 dark:data-pressed:text-charcoal-900"
        >
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
