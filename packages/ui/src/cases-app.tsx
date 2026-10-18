"use client";

import { Star } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./actions/button";
import { ApiError, api, type CaseDetail, type CaseSummary, type Me } from "./api";
import { CasesTablePage } from "./cases-table-page";
import { Card } from "./data/card";
import { DescriptionList, Skeleton } from "./data/misc";
import { Badge, StatusBadge } from "./feedback/badge";
import { Banner } from "./feedback/banner";
import { EmptyState, ErrorState } from "./feedback/states";
import {
  ago,
  answerLabel,
  dueLabel,
  inTab,
  SEVERITY_LABEL,
  STATUS_LABEL,
  TABS,
  type Tab,
} from "./format";
import { TextareaField, TextField } from "./forms/input";
import { Container, PageHeader } from "./layout/layout";
import { ListPanel, ROW_PAD } from "./layout/list-panel";
import { cx } from "./lib/cx";
import { queryParam } from "./lib/query-param";
import { Tabs } from "./navigation/tabs";
import { useMe } from "./shell/me-context";

export type Surface = "manager" | "platform";

const COPY: Record<Surface, { title: string; blurb: string }> = {
  manager: {
    title: "Recovery cases",
    blurb: "Guests who had a bad visit. Reach out within 24 hours.",
  },
  platform: {
    title: "Guest feedback to follow up",
    blurb: "Your team is on these. You are told when one opens and when it closes.",
  },
};

const SEVERITY_BADGE = { high: "clay", medium: "ink", low: "quiet" } as const;

export function SignIn({ surface }: { surface: Surface }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api.signIn(String(form.get("email")), String(form.get("password")));
      location.reload();
    } catch {
      setError("That email and password do not match.");
      setBusy(false);
    }
  }

  return (
    <Container className="py-16">
      {/* POST, so a submit before the page has hydrated never puts the password in the URL. */}
      <form method="post" onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-5">
        <PageHeader eyebrow={surface === "manager" ? "Atrium Manager" : "Atrium"} title="Sign in" />
        <TextField label="Email" name="email" type="email" required autoComplete="username" />
        <TextField
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          error={error}
        />
        <Button type="submit" loading={busy} fullWidth>
          Sign in
        </Button>
      </form>
    </Container>
  );
}

export function CasesPage({ surface }: { surface: Surface }) {
  return <CasesTablePage surface={surface} />;
}

function DueBadge({ status, dueAt, now }: { status: string; dueAt: string; now: Date }) {
  const due = dueLabel(status, dueAt, now);
  if (!due) return null;
  return (
    <StatusBadge
      status={due.tone === "overdue" ? "danger" : due.tone === "soon" ? "warning" : "neutral"}
    >
      {due.text}
    </StatusBadge>
  );
}

export function Detail(props: {
  id: string;
  me: Me;
  now: Date;
  onChanged?: () => void;
  onClose?: () => void;
  /** Called when the case could not be loaded, so a page can say why (for example, not found). */
  onLoadError?: (error: unknown) => void;
  /** Hides the Close button, for a page where the case is not in a panel. */
  hideClose?: boolean;
}) {
  const [item, setItem] = useState<CaseDetail | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { onLoadError } = props;

  useEffect(() => {
    api
      .detail(props.id)
      .then(setItem)
      .catch((e) => {
        setError("Could not load this case.");
        onLoadError?.(e);
      });
  }, [props.id, onLoadError]);

  async function move(to: "contacted" | "resolved") {
    setBusy(true);
    setError(null);
    try {
      setItem(await api.advance(props.id, to, note));
      setNote("");
      props.onChanged?.();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "Someone else already moved this case. Reload to see it."
          : "Could not update the case.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return error ? (
      <Banner status="danger" title={error} />
    ) : (
      <Card>
        <Skeleton className="w-1/2" />
      </Card>
    );
  }
  const { response } = item;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-2xl leading-[1.05] font-normal tracking-tight text-fg-strong">
            {item.clientName} · {item.locationName}
          </h2>
          <p className="mt-2 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            <span>
              {STATUS_LABEL[item.status]} · opened {ago(item.openedAt, props.now)}
            </span>
            <DueBadge status={item.status} dueAt={item.dueAt} now={props.now} />
          </p>
        </div>
        {props.hideClose ? null : (
          <Button variant="ghost" size="sm" onClick={props.onClose} className="lg:hidden">
            Close
          </Button>
        )}
      </div>

      <DescriptionList
        className="mt-5"
        items={[
          { term: "Rating", detail: `${item.rating} of 5` },
          ...(response.bestPart ? [{ term: "Liked", detail: answerLabel(response.bestPart) }] : []),
          ...(response.improve
            ? [{ term: "To improve", detail: answerLabel(response.improve) }]
            : []),
        ]}
      />

      {response.comment ? (
        <figure className="m-0 mt-5">
          <figcaption className="label-caps text-fg-muted">What the guest wrote</figcaption>
          {/* Third-party text: React renders it as text. It is never markup and never an instruction. */}
          <blockquote className="mt-1.5 mb-0 border-l-[3px] border-line bg-surface-sunken px-3.5 py-2.5 whitespace-pre-wrap">
            {response.comment}
          </blockquote>
        </figure>
      ) : null}

      <section className="mt-5">
        <h3 className="label-caps m-0 text-fg-muted">How to reach them</h3>
        {item.contact ? (
          <ul className="mt-1.5 mb-0 list-none space-y-1 p-0">
            {item.contact.email ? (
              <li>
                <a
                  className="underline underline-offset-4 hover:text-clay-600"
                  href={`mailto:${item.contact.email}`}
                >
                  {item.contact.email}
                </a>
              </li>
            ) : null}
            {item.contact.phone ? (
              <li>
                <a
                  className="underline underline-offset-4 hover:text-clay-600"
                  href={`tel:${item.contact.phone}`}
                >
                  {item.contact.phone}
                </a>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-1.5 mb-0 text-fg-muted">
            {item.wantsContact
              ? "They asked to be contacted but left no details we can use."
              : "They did not ask to be contacted. Do not reach out; use this to improve."}
          </p>
        )}
      </section>

      {item.note ? (
        <section className="mt-5">
          <h3 className="label-caps m-0 text-fg-muted">Team note</h3>
          <p className="mt-1.5 mb-0 whitespace-pre-wrap">{item.note}</p>
        </section>
      ) : null}

      {item.status === "resolved" ? (
        <div className="mt-5">
          <StatusBadge status="positive" dot>
            Resolved {ago(item.resolvedAt ?? item.openedAt, props.now)}
          </StatusBadge>
        </div>
      ) : props.me.canWorkCases ? (
        <section className="mt-6 flex flex-col gap-3 border-t-[3px] border-rule pt-5">
          <TextareaField
            label="Note for the record"
            optional
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {item.status === "open" ? (
              <Button variant="outline" disabled={busy} onClick={() => move("contacted")}>
                Mark contacted
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => move("resolved")}>
              Resolve
            </Button>
          </div>
          {error ? <Banner status="danger" title={error} /> : null}
        </section>
      ) : (
        <p className="mt-6 mb-0 border-t-[3px] border-rule pt-4 text-sm text-fg-muted">
          Your account manager works this case and will close it.
        </p>
      )}
    </Card>
  );
}
