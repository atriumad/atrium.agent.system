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
export const Tr = ({ className, ...rest }: ComponentProps<"tr">) => (
  <tr
    className={cx(
      "group relative hover:bg-surface-sunken aria-selected:bg-lime-100 dark:aria-selected:bg-charcoal-700",
      className,
    )}
    {...rest}
  />
);
export const Th = ({ className, ...rest }: ComponentProps<"th">) => (
  <th
    className={cx(
      "label-caps border-b border-line px-4 py-3 text-left whitespace-nowrap text-fg-muted aria-sort:text-fg-strong",
      className,
    )}
    {...rest}
  />
);
export const Td = ({
  className,
  numeric,
  ...rest
}: ComponentProps<"td"> & { numeric?: boolean | undefined }) => (
  <td
    className={cx(
      "border-b border-line px-4 py-3.5 align-middle",
      numeric && "text-right tabular-nums",
      className,
    )}
    {...rest}
  />
);
