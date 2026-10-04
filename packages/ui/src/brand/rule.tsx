import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export type RuleProps = Omit<ComponentProps<"div">, "children"> & {
  /** A wide-caps label set in the middle of the rule. */
  label?: string;
  /** `bold` is the 3px section rule, `hair` the 1px line between rows. */
  weight?: "bold" | "hair";
  tone?: "ink" | "light" | "on-dark";
};

const LINE = {
  ink: "bg-rule",
  light: "bg-line",
  "on-dark": "bg-line-dark",
};

/** The heavy section divider, optionally carrying a caps label. */
export function Rule({ label, weight = "bold", tone = "ink", className, ...rest }: RuleProps) {
  const line = cx("flex-1", weight === "bold" ? "h-[3px]" : "h-px", LINE[tone]);
  return (
    <div role="separator" className={cx("flex w-full items-center gap-4", className)} {...rest}>
      <span className={line} />
      {label ? (
        <span className={cx("label-caps", tone === "on-dark" ? "text-cream-400" : "text-fg-muted")}>
          {label}
        </span>
      ) : null}
      {label ? <span className={line} /> : null}
    </div>
  );
}
