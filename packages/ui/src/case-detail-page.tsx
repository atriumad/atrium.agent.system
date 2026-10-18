"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { ApiError } from "./api";
import { Detail, type Surface } from "./cases-app";
import { ErrorState } from "./feedback/states";
import { PageHeader } from "./layout/layout";
import { useMe } from "./shell/me-context";

const LIST: Record<Surface, string> = {
  manager: "/reputation/cases",
  platform: "/reputation/feedback",
};

/** The page of one case. */
export function caseHref(surface: Surface, id: string): string {
  return `${LIST[surface]}/${encodeURIComponent(id)}`;
}

/**
 * An address from before a case had its own page (`?case=<id>`) becomes the case route,
 * keeping every other parameter. Null when the address names no case.
 */
export function redirectLegacyCase(surface: Surface, search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get("case");
  if (!id) return null;
  params.delete("case");
  const rest = params.toString();
  return `${caseHref(surface, id)}${rest ? `?${rest}` : ""}`;
}

/** True when the page before this one is the list, so going back lands where the person came from. */
function cameFromList(list: string): boolean {
  try {
    if (!document.referrer || window.history.length < 2) return false;
    const from = new URL(document.referrer);
    return from.origin === window.location.origin && from.pathname === list;
  } catch {
    return false;
  }
}

function BackLink({ list }: { list: string }) {
  return (
    <a
      href={list}
      onClick={(e) => {
        if (cameFromList(list)) {
          e.preventDefault();
          window.history.back();
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted underline underline-offset-4 hover:text-clay-600"
    >
      <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
      Back to cases
    </a>
  );
}

/** One case on its own page, full width: what a table row, the bell and a notification open. */
export function CaseDetailPage({ surface, id }: { surface: Surface; id: string }) {
  const me = useMe();
  const list = LIST[surface];
  const [failure, setFailure] = useState<"missing" | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => new Date());

  const onLoadError = useCallback((e: unknown) => {
    const missing = e instanceof ApiError && (e.status === 404 || e.code === "not_found");
    setFailure(missing ? "missing" : "error");
  }, []);
  const noop = useCallback(() => undefined, []);

  return (
    <div className="flex flex-col gap-6">
      <BackLink list={list} />
      <PageHeader compact title="Case" />
      {failure === "missing" ? (
        <ErrorState title="That case does not exist or is not yours.">
          <a href={list} className="underline underline-offset-4">
            Go to the cases list
          </a>
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
        <Detail
          key={`${id}:${attempt}`}
          id={id}
          me={me}
          now={now}
          onChanged={noop}
          onClose={noop}
          hideClose
          onLoadError={onLoadError}
        />
      )}
    </div>
  );
}
