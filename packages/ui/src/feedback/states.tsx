import { Loader2, RefreshCw } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "../actions/button";
import { cx } from "../lib/cx";
import { Banner } from "./banner";

export type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
};

/** Says what will appear and when, and offers the one next step. Never a dead end. */
export function EmptyState({ icon, title, action, className, children, ...rest }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-2 rounded-md border border-dashed border-charcoal-400 px-6 py-10 text-center",
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span
          className="grid size-10 place-items-center rounded-sm border border-charcoal-800 dark:border-cream-300"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <h3 className="mt-1.5 mb-0 text-2xl leading-[1.05] font-normal tracking-tight text-fg-strong">
        {title}
      </h3>
      {children ? <p className="m-0 mb-2 max-w-[38ch] text-sm text-fg-muted">{children}</p> : null}
      {action}
    </div>
  );
}

export type ErrorStateProps = {
  title?: string;
  children?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

/** Says what failed and offers Retry. Keep what was already on screen: this goes above it, not instead of it. */
export function ErrorState({
  title = "We could not load this.",
  children,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <Banner
      status="danger"
      title={title}
      className={className}
      action={
        onRetry ? (
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw size={14} strokeWidth={1.5} />}
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      {children}
    </Banner>
  );
}

/** A spinner for something no bigger than a button. For anything larger, show a Skeleton. */
export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cx("inline-flex", className)}>
      <Loader2
        size={20}
        strokeWidth={1.5}
        className="animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
