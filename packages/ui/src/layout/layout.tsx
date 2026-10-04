import type { ComponentProps, ReactNode } from "react";
import { Rule } from "../brand/rule";
import { cx } from "../lib/cx";

/** Content stops at 1240px (1440 wide) with the system's gutter. */
export function Container({
  wide,
  className,
  ...rest
}: ComponentProps<"div"> & { wide?: boolean }) {
  return (
    <div
      className={cx(
        "mx-auto w-full px-[clamp(1.25rem,4vw,3.5rem)]",
        wide ? "max-w-[1440px]" : "max-w-[1240px]",
        className,
      )}
      {...rest}
    />
  );
}

const GAP = {
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  6: "gap-6",
  8: "gap-8",
  12: "gap-12",
};

export type StackProps = ComponentProps<"div"> & {
  gap?: keyof typeof GAP;
  align?: "start" | "center" | "end" | "stretch";
};
const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

/** A column with a gap from the 4px grid. */
export function Stack({ gap = 4, align = "stretch", className, ...rest }: StackProps) {
  return <div className={cx("flex flex-col", GAP[gap], ALIGN[align], className)} {...rest} />;
}

/** A row that wraps, with a gap from the 4px grid. */
export function Inline({ gap = 3, align = "center", className, ...rest }: StackProps) {
  return <div className={cx("flex flex-wrap", GAP[gap], ALIGN[align], className)} {...rest} />;
}

/** Equal columns that collapse: `min` is the narrowest a column may get. */
export function Grid({
  min = 220,
  gap = 4,
  className,
  style,
  ...rest
}: Omit<ComponentProps<"div">, "children"> & {
  min?: number;
  gap?: keyof typeof GAP;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx("grid", GAP[gap], className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        ...style,
      }}
      {...rest}
    />
  );
}

export type PageHeaderProps = Omit<ComponentProps<"header">, "title"> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

/** An eyebrow, a headline at 400, a line of context and the page's actions. The headline is the page's h1. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <header className={cx("flex flex-wrap items-end justify-between gap-4", className)} {...rest}>
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? (
          <span className="label-caps inline-flex items-center gap-3 text-fg-muted before:h-px before:w-7 before:bg-current before:opacity-50 before:content-['']">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="m-0 text-4xl leading-none font-normal tracking-tighter text-fg-strong">
          {title}
        </h1>
        {description ? <p className="m-0 max-w-[68ch] text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export type SectionProps = Omit<ComponentProps<"section">, "title"> & {
  title: ReactNode;
  label?: string;
};

/** A section under the 3px rule, with an optional numbered caps label: "02 — Results". */
export function Section({ title, label, className, children, ...rest }: SectionProps) {
  return (
    <section className={cx("flex flex-col gap-5", className)} {...rest}>
      <Rule {...(label ? { label } : {})} />
      <h2 className="m-0 text-3xl leading-[1.05] font-normal tracking-tight text-fg-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}
