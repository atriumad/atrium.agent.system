"use client";

import type { ReactNode } from "react";
import { ErrorState } from "../feedback/states";
import { PageHeader } from "../layout/layout";
import { Skeleton } from "./misc";

export type SectionBandProps = {
  state: "loading" | "error" | "ok";
  onRetry: () => void;
  title: string;
  tiles: ReactNode;
  aside?: ReactNode;
};

/** The summary on top of a section page. It has its own loading and error, and never blocks the table. */
export function SectionBand({ state, onRetry, title, tiles, aside }: SectionBandProps) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 lg:min-h-[clamp(14rem,30vh,20rem)] lg:flex-row lg:items-stretch"
    >
      {state === "loading" ? (
        <div
          role="status"
          aria-label="Loading the summary"
          className="grid w-full flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-card lg:h-full" />
          ))}
        </div>
      ) : state === "error" ? (
        <ErrorState
          title="Could not load the summary"
          onRetry={onRetry}
          retryLabel="Retry"
          className="w-full"
        />
      ) : (
        <>
          <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{tiles}</div>
          {aside ? <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">{aside}</div> : null}
        </>
      )}
    </section>
  );
}

export type DataSectionPageProps = {
  title: string;
  description?: ReactNode;
  /** The range and place controls. */
  controls?: ReactNode;
  band?: ReactNode;
  tabs?: ReactNode;
  /** The filter bar and the table. */
  children: ReactNode;
};

/** A section page: header and controls, the summary band, optional tabs, then the filter bar and table. */
export function DataSectionPage({
  title,
  description,
  controls,
  band,
  tabs,
  children,
}: DataSectionPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader compact title={title} description={description} actions={controls} />
      {band}
      <p className="m-0 text-xs text-fg-muted">
        Filters apply to the table; the summary follows the range and place.
      </p>
      {tabs}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}
