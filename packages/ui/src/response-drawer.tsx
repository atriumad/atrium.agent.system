"use client";

import { useRef } from "react";
import { Button } from "./actions/button";
import type { ResponseTableRow } from "./api";
import { caseHref } from "./case-links";
import type { Surface } from "./cases-app";
import { SentimentPill, Stars, TopicChips, When } from "./data/cells";
import { Drawer } from "./feedback/overlays";

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-caps text-fg-muted">{label}</dt>
      <dd className="m-0 text-sm text-fg-strong">{children}</dd>
    </div>
  );
}

const none = <span className="text-fg-muted">Nothing written</span>;

/** One answer in full: what the guest wrote, the reading of it, their contact preference and the case. */
export function ResponseDrawer({
  row,
  onClose,
  surface,
  showClient,
  canAskForHelp,
  backSearch,
  now,
}: {
  row: ResponseTableRow | null;
  onClose: () => void;
  surface: Surface;
  showClient: boolean;
  canAskForHelp: boolean;
  backSearch: string | undefined;
  now: Date;
}) {
  // The last answer stays while the drawer slides out.
  const last = useRef<ResponseTableRow | null>(null);
  if (row) last.current = row;
  const r = row ?? last.current;
  return (
    <Drawer
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={r ? `${r.locationName}` : "Response"}
      description={
        r ? (
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars rating={r.rating} />
            <When date={r.createdAt} now={now} />
            {showClient ? <span>{r.clientName}</span> : null}
          </span>
        ) : undefined
      }
      closeLabel="Close response"
    >
      {r ? (
        <div className="flex flex-col gap-6">
          <dl className="m-0 flex flex-col gap-4">
            <Part label="Comment">{r.comment ?? none}</Part>
            <Part label="Best part">{r.bestPart ?? none}</Part>
            <Part label="What to improve">{r.improve ?? none}</Part>
          </dl>
          <dl className="m-0 flex flex-col gap-4 border-t border-line pt-4">
            <Part label="Reading">
              {r.sentiment === null ? (
                <span className="text-fg-muted">Not read yet</span>
              ) : (
                <span className="flex flex-col items-start gap-2">
                  <SentimentPill sentiment={r.sentiment} />
                  {r.concern ? <span>{r.concern}</span> : null}
                  <TopicChips topics={r.topics} />
                  <span>{r.safety ? "Flagged as a safety concern" : "No safety concern"}</span>
                </span>
              )}
            </Part>
            <Part label="Contact">
              {r.wantsContact ? "Wants to be contacted" : "Does not want to be contacted"}
            </Part>
            <Part label="Review link">
              {r.reviewClicked ? "Went to the review link" : "Did not go to the review link"}
            </Part>
          </dl>
          <div className="flex flex-wrap gap-2">
            {r.caseId ? (
              <Button
                size="sm"
                nativeButton={false}
                render={<a href={caseHref(surface, r.caseId, backSearch)} />}
              >
                Open case
              </Button>
            ) : null}
            {canAskForHelp ? (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<a href={`/help?response=${r.id}&location=${r.locationId}`} />}
              >
                Ask for help about this
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
