"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { cx } from "../lib/cx";

/** A link in running text: underlined with a 3px offset, clay and 2px on hover. */
export function Link({ className, ...rest }: ComponentProps<"a">) {
  return (
    <a
      className={cx(
        "text-fg-strong underline decoration-1 underline-offset-[3px] transition-colors duration-(--dur-base) hover:text-clay-600 hover:decoration-2 dark:hover:text-clay-300",
        className,
      )}
      {...rest}
    />
  );
}

export type BreadcrumbsProps = {
  items: { label: string; href?: string }[];
  label?: string;
  /** The last item is the current page and is never a link. */
  linkAs?: ElementType;
  className?: string;
};

/** The path in a deep area, as wide-caps labels. */
export function Breadcrumbs({
  items,
  label = "Breadcrumb",
  linkAs: LinkAs = "a",
  className,
}: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="label-caps m-0 flex list-none flex-wrap items-center gap-2 p-0 text-fg-muted">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={it.label} className="inline-flex items-center gap-2">
              {last || !it.href ? (
                <span
                  {...(last ? { "aria-current": "page" as const } : {})}
                  className={last ? "text-fg-strong" : undefined}
                >
                  {it.label}
                </span>
              ) : (
                <LinkAs href={it.href} className="hover:text-clay-600">
                  {it.label}
                </LinkAs>
              )}
              {last ? null : <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type PaginationProps = {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  labels?: { nav: string; prev: string; next: string; page: (n: number) => string };
  className?: string;
};

/** Squared 1px buttons with the current page filled charcoal. For long lists where a person looks for a row. */
export function Pagination({
  page,
  pages,
  onPageChange,
  labels = {
    nav: "Pagination",
    prev: "Previous page",
    next: "Next page",
    page: (n) => `Page ${n}`,
  },
  className,
}: PaginationProps) {
  const btn =
    "inline-grid h-[34px] min-w-[34px] cursor-pointer place-items-center rounded-sm border border-line px-2.5 text-sm tabular-nums hover:not-disabled:border-charcoal-800 disabled:cursor-not-allowed disabled:opacity-40";
  const nums: number[] = [];
  for (let n = 1; n <= pages; n++)
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) nums.push(n);
  return (
    <nav aria-label={labels.nav} className={cx("inline-flex items-center gap-1", className)}>
      <button
        type="button"
        className={btn}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label={labels.prev}
      >
        <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {nums.map((n, i) => (
        <span key={n} className="inline-flex items-center gap-1">
          {i > 0 && n - (nums[i - 1] as number) > 1 ? (
            <span aria-hidden="true" className="px-1 text-fg-muted">
              …
            </span>
          ) : null}
          <button
            type="button"
            className={cx(
              btn,
              n === page &&
                "border-charcoal-800 bg-charcoal-800 text-cream-200 dark:border-lime-500 dark:bg-lime-500 dark:text-charcoal-900",
            )}
            aria-current={n === page ? "page" : undefined}
            aria-label={labels.page(n)}
            onClick={() => onPageChange(n)}
          >
            {n}
          </button>
        </span>
      ))}
      <button
        type="button"
        className={btn}
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        aria-label={labels.next}
      >
        <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </nav>
  );
}

export type StepperProps = {
  steps: { label: string; description?: string }[];
  /** Zero-based index of the current step. */
  current: number;
  className?: string;
};

/** A short ordered flow (onboarding, connecting a source). Done steps are filled, the current one carries the 3px rule. */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cx("m-0 flex list-none flex-wrap gap-x-8 gap-y-3 p-0", className)}>
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li
            key={s.label}
            aria-current={now ? "step" : undefined}
            className={cx(
              "flex min-w-32 flex-1 flex-col gap-1 border-t-[3px] pt-3",
              done || now ? "border-rule" : "border-line",
            )}
          >
            <span className="label-caps text-fg-muted">
              {`${String(i + 1).padStart(2, "0")} —`}{" "}
              {done ? <span className="sr-only">done</span> : null}
            </span>
            <span className={cx("text-sm", now ? "text-fg-strong" : "text-fg-muted")}>
              {s.label}
            </span>
            {s.description ? <span className="text-xs text-fg-muted">{s.description}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export type { ReactNode };
