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
 * From `lg` the tiles are ONE row of four with the aside under them as two blocks; from `2xl` the aside
 * takes the last third on the right. Under `lg` the tiles are two by two and the aside stacks.
 */
export function SectionBand({ state, onRetry, title, tiles, aside }: SectionBandProps) {
  const height = "lg:min-h-[clamp(14rem,30vh,20rem)]";
  return (
    <section
      aria-label={title}
      className={
        state === "ok"
          ? `grid gap-4 ${height} 2xl:grid-cols-3 2xl:items-stretch`
          : "flex flex-col gap-4"
      }
    >
      {state === "loading" ? (
        <div
          role="status"
          aria-label="Loading the summary"
          className={`grid w-full gap-4 ${height} 2xl:grid-cols-3`}
        >
          <div
            className={`grid grid-cols-2 gap-4 lg:grid-cols-4 ${aside === undefined ? "2xl:col-span-3" : "2xl:col-span-2"}`}
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-card lg:h-full" />
            ))}
          </div>
          {aside === undefined ? null : <Skeleton className="h-40 rounded-card lg:h-full" />}
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
            className={`grid grid-cols-2 gap-4 lg:grid-cols-4 ${aside ? "2xl:col-span-2" : "2xl:col-span-3"}`}
          >
            {tiles}
          </div>
          {aside ? (
            <div className="grid min-w-0 gap-4 lg:grid-cols-2 2xl:col-span-1 2xl:grid-cols-1">
              {aside}
            </div>
          ) : null}
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
