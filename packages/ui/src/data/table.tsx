import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

/** A table is framed like a card: a hairline, the card radius, and headers over a hairline. */
export function TableWrap({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "overflow-x-auto rounded-card border border-frame bg-surface-card [&_tr:last-child>td]:border-b-0",
        className,
      )}
      {...rest}
    />
  );
}
export const Table = ({ className, ...rest }: ComponentProps<"table">) => (
  <table className={cx("w-full border-collapse text-sm", className)} {...rest} />
);
export const THead = (props: ComponentProps<"thead">) => <thead {...props} />;
export const TBody = (props: ComponentProps<"tbody">) => <tbody {...props} />;
export const Tr = ({
  className,
  dense,
  ...rest
}: ComponentProps<"tr"> & { dense?: boolean | undefined }) => (
  <tr
    className={cx(
      "group relative aria-selected:bg-lime-100 dark:aria-selected:bg-charcoal-700",
      dense ? "hover:bg-lime-100 dark:hover:bg-charcoal-700" : "hover:bg-surface-sunken",
      className,
    )}
    {...rest}
  />
);
export const Th = ({
  className,
  dense,
  ...rest
}: ComponentProps<"th"> & { dense?: boolean | undefined }) => (
  <th
    className={cx(
      "label-caps border-b text-left whitespace-nowrap text-fg-muted aria-sort:text-fg-strong",
      dense
        ? "sticky top-0 z-10 border-charcoal-800 bg-surface-sunken px-3 py-2.5 dark:border-cream-300"
        : "border-line px-4 py-3",
      className,
    )}
    {...rest}
  />
);
export const Td = ({
  className,
  numeric,
  dense,
  ...rest
}: ComponentProps<"td"> & { numeric?: boolean | undefined; dense?: boolean | undefined }) => (
  <td
    className={cx(
      "border-b border-line align-middle",
      dense ? "h-11 px-3 py-0 whitespace-nowrap" : "px-4 py-3.5",
      numeric && "text-right tabular-nums",
      className,
    )}
    {...rest}
  />
);
