import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";

export const cardStyles = cva(
  "relative rounded-md border transition-[transform,box-shadow,border-color] duration-(--dur-base) ease-out",
  {
    variants: {
      tone: {
        paper: "border-line bg-surface-card text-fg-body",
        ruled: "border-charcoal-800 bg-surface-card text-fg-body dark:border-cream-300",
        sunken: "border-transparent bg-surface-sunken text-fg-body",
        dark: "border-charcoal-800 bg-surface-dark text-fg-on-dark",
        lime: "border-lime-500 bg-surface-lime text-fg-on-lime",
        clay: "border-clay-500 bg-surface-clay text-fg-on-clay", // text on clay-500 must be 24px or larger
      },
      elevation: { flat: "", card: "shadow-card", offset: "shadow-raised", pop: "shadow-pop" },
      padding: { none: "p-0", sm: "p-4", md: "p-6", lg: "p-8" },
      interactive: {
        true: "cursor-pointer hover:-translate-y-0.5 hover:border-charcoal-800 hover:shadow-raised",
        false: "",
      },
    },
    defaultVariants: { tone: "paper", elevation: "flat", padding: "md", interactive: false },
  },
);

export type CardProps = Omit<ComponentProps<"div">, "title"> &
  VariantProps<typeof cardStyles> & { title?: ReactNode; description?: ReactNode };

/** A drawn container: cream-100, a 6px radius, a 1px hairline, no shadow. One lime or clay card per region. */
export function Card({
  tone,
  elevation,
  padding,
  interactive,
  title,
  description,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div className={cx(cardStyles({ tone, elevation, padding, interactive }), className)} {...rest}>
      {title || description ? (
        <CardHeader title={title} description={description} tone={tone ?? "paper"} />
      ) : null}
      {children}
    </div>
  );
}

const TITLE_TONE = {
  paper: "text-fg-strong",
  ruled: "text-fg-strong",
  sunken: "text-fg-strong",
  dark: "text-lime-500",
  lime: "text-charcoal-900",
  clay: "text-cream-100",
};
const DESC_TONE = {
  paper: "text-fg-muted",
  ruled: "text-fg-muted",
  sunken: "text-fg-muted",
  dark: "text-cream-400",
  lime: "text-charcoal-800",
  clay: "text-cream-100",
};

export function CardHeader({
  title,
  description,
  tone = "paper",
}: {
  title?: ReactNode;
  description?: ReactNode;
  tone?: keyof typeof TITLE_TONE;
}) {
  return (
    <div className="mb-4">
      {title ? (
        <h3
          className={cx("m-0 text-2xl leading-[1.05] font-normal tracking-tight", TITLE_TONE[tone])}
        >
          {title}
        </h3>
      ) : null}
      {description ? (
        <p className={cx("mt-2 mb-0 text-sm", DESC_TONE[tone])}>{description}</p>
      ) : null}
    </div>
  );
}

export const CardFooter = ({ className, ...rest }: ComponentProps<"div">) => (
  <div
    className={cx("mt-6 flex items-center justify-end gap-2 border-t border-line pt-4", className)}
    {...rest}
  />
);
