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

/**
 * The summary on top of a section page. It has its own loading and error, and never blocks the table.
 * From `lg` it is about a third of the viewport tall: the tiles are ONE row of four from `xl` (two by
 * two below) and the aside takes the last third, stacked below on narrow screens.
 */
export function SectionBand({ state, onRetry, title, tiles, aside }: SectionBandProps) {
  const grid =
    "grid gap-4 lg:min-h-[clamp(14rem,30vh,20rem)] xl:grid-cols-3 xl:items-stretch";
  return (
    <section aria-label={title} className={state === "ok" ? grid : "flex flex-col gap-4"}>
      {state === "loading" ? (
        <div
          role="status"
          aria-label="Loading the summary"
          className="grid w-full gap-4 lg:min-h-[clamp(14rem,30vh,20rem)] xl:grid-cols-3"
        >
          <div className="grid grid-cols-2 gap-4 xl:col-span-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-card lg:h-full" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-card lg:h-full" />
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
          <div
            className={`grid grid-cols-2 gap-4 xl:grid-cols-4 ${aside ? "xl:col-span-2" : "xl:col-span-3"}`}
          >
            {tiles}
          </div>
          {aside ? <div className="flex min-w-0 flex-col gap-4 xl:col-span-1">{aside}</div> : null}
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
