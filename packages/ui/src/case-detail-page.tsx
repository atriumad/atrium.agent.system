"use client";

import { ArrowLeft } from "lucide-react";
import { type ElementType, useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { Detail, type Surface } from "./cases-app";
import { ErrorState } from "./feedback/states";
import { PageHeader } from "./layout/layout";
import { useMe } from "./shell/me-context";

const LIST: Record<Surface, string> = {
  manager: "/reputation/cases",
  platform: "/reputation/feedback",
};

/** The page of one case. `backSearch` is the list's query string, so Back can return to it. */
export function caseHref(surface: Surface, id: string, backSearch?: string): string {
  const path = `${LIST[surface]}/${encodeURIComponent(id)}`;
  return backSearch ? `${path}?back=${encodeURIComponent(backSearch)}` : path;
}

/**
 * The list of a surface, with the search a person came from. Only a plain query string is
 * appended to a fixed path, so nothing here can send a person to another site.
 */
export function listHref(surface: Surface, backParam: string | null): string {
  const ok =
    typeof backParam === "string" &&
    backParam.startsWith("?") &&
    backParam.length <= 500 &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
    !/[\u0000-\u001f\u007f#]/.test(backParam);
  return ok ? `${LIST[surface]}${backParam}` : LIST[surface];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An address from before a case had its own page (`?case=<id>`) becomes the case route,
 * keeping every other parameter. Null when the address names no case, or not a case id.
 */
export function redirectLegacyCase(surface: Surface, search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get("case");
  if (!id || !UUID.test(id)) return null;
  params.delete("case");
  const rest = params.toString();
  return `${caseHref(surface, id)}${rest ? `?${rest}` : ""}`;
}

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
        <Detail
          key={`${id}:${attempt}`}
          id={id}
          me={me}
          now={now}
          hideClose
          onLoadError={onLoadError}
        />
      )}
    </div>
  );
}
