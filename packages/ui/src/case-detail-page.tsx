"use client";

import { ArrowLeft } from "lucide-react";
import { type ElementType, useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { LIST, listHref } from "./case-links";
import { Detail, type Surface } from "./cases-app";

export { caseHref, listHref, redirectLegacyCase } from "./case-links";

import { ErrorState } from "./feedback/states";
import { PageHeader } from "./layout/layout";
import { useMe } from "./shell/me-context";

function BackLink({ href, linkAs: LinkAs = "a" }: { href: string; linkAs?: ElementType }) {
  return (
    <LinkAs
      href={href}
      className="inline-flex items-center gap-1.5 self-start text-sm text-fg-muted underline underline-offset-4 hover:text-clay-600"
    >
      <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
      Back to cases
    </LinkAs>
  );
}

/** One case on its own page, full width: what a table row, the bell and a notification open. */
export function CaseDetailPage({
  surface,
  id,
  linkAs: LinkAs = "a",
}: {
  surface: Surface;
  id: string;
  linkAs?: ElementType;
}) {
  const me = useMe();
  const list = LIST[surface];
  const [failure, setFailure] = useState<"missing" | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => new Date());

  const onLoadError = useCallback((e: unknown) => {
    const missing = e instanceof ApiError && (e.status === 404 || e.code === "not_found");
    setFailure(missing ? "missing" : "error");
  }, []);
  const [back, setBack] = useState<string | null>(null);
  useEffect(() => {
    setBack(new URLSearchParams(window.location.search).get("back"));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={listHref(surface, back)} linkAs={LinkAs} />
      <PageHeader compact title="Case" />
      {failure === "missing" ? (
        <ErrorState title="That case does not exist or is not yours.">
          <LinkAs href={list} className="underline underline-offset-4">
            Go to the cases list
          </LinkAs>
        </ErrorState>
      ) : failure === "error" ? (
        <ErrorState
          title="Could not load this case."
          onRetry={() => {
            setFailure(null);
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
<div className="w-full max-w-4xl">
        <Detail
          key={`${id}:${attempt}`}
          id={id}
          me={me}
          now={now}
          hideClose
          onLoadError={onLoadError}
        />
</div>
      )}
    </div>
  );
}
