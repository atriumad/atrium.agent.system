import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import { STATUS_ICON, type Status } from "./badge";

export type BannerProps = Omit<ComponentProps<"div">, "title"> & {
  status?: Status;
  title?: ReactNode;
  /** At most one action. */
  action?: ReactNode;
};

const TONE: Record<Status, string> = {
  positive: "border-status-positive-line bg-status-positive-bg",
  warning: "border-status-warning-line bg-status-warning-bg",
  danger: "border-status-danger-line bg-status-danger-bg",
  info: "border-status-info-line bg-status-info-bg",
  neutral: "border-status-neutral-line bg-status-neutral-bg",
};

/** Speaks for the page or a section: a fill, a 1px border in the status colour, an icon, a title, one sentence, at most one action. A danger banner is announced as an alert. */
export function Banner({
  status = "info",
  title,
  action,
  className,
  children,
  ...rest
}: BannerProps) {
  const Glyph = STATUS_ICON[status];
  return (
    <div
      role={status === "danger" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3 rounded-sm border px-4 py-3.5 text-sm text-fg-body",
        TONE[status],
        className,
      )}
      {...rest}
    >
      <Glyph size={18} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="m-0 font-medium text-fg-strong">{title}</p> : null}
        {children ? <p className="mt-0.5 mb-0">{children}</p> : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
