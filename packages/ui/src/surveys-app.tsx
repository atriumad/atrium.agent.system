"use client";

import { Check, Copy, ExternalLink, Paperclip, Star, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./actions/button";
import { ChipGroup } from "./actions/chip";
import {
  ApiError,
  api,
  type Me,
  type PlaceOption,
  type SurveyForm,
  type SurveyRequest,
  type SurveyResponse,
} from "./api";
import { Card } from "./data/card";
import { Skeleton } from "./data/misc";
import { Badge, StatusBadge } from "./feedback/badge";
import { Banner } from "./feedback/banner";
import { ConfirmDialog } from "./feedback/overlays";
import { EmptyState, ErrorState } from "./feedback/states";
import { ago } from "./format";
import { Field } from "./forms/field";
import { TextareaField, TextField } from "./forms/input";
import { Select } from "./forms/select";
import { HelpThreads } from "./help-thread";
import { PageHeader } from "./layout/layout";
import { ListPanel, ROW_PAD } from "./layout/list-panel";
import { useMe } from "./shell/me-context";
import { NotAvailable } from "./shell/not-available";

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [load]);
  useEffect(run, [run]);
  return { data, failed, reload: run };
}

function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(value);
        } catch {
          return; // the browser refused the copy: do not claim it worked
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
      {done ? "Copied" : label}
    </Button>
  );
}

/* ------------------------------- responses ------------------------------- */

function Responses() {
  const [low, setLow] = useState(false);
  const load = useCallback(() => api.surveyResponses(low ? 3 : undefined), [low]);
  const { data, failed, reload } = useLoad(load);
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <ChipGroup
        aria-label="Filter responses"
        value={[low ? "low" : "all"]}
        onValueChange={(v: string[]) => setLow(v[0] === "low")}
        options={[
          { value: "all", label: "All" },
          { value: "low", label: "3 stars or fewer" },
        ]}
      />
      {failed ? <ErrorState title="Could not load responses" onRetry={reload} /> : null}
      {data === null && !failed ? (
        <Skeleton className="h-24 w-full" />
      ) : data?.length === 0 ? (
        <EmptyState title="No responses yet">
          Answers appear here as soon as a guest finishes the survey.
        </EmptyState>
      ) : (
        <ListPanel aria-label="Survey responses">
          {data?.map((r) => (
            <ResponseCard key={r.id} r={r} now={now} />
          ))}
        </ListPanel>
      )}
    </div>
  );
}

function ResponseCard({ r, now }: { r: SurveyResponse; now: Date }) {
  const me = useMe();
  return (
    <li className={ROW_PAD}>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center gap-1 font-serif text-2xl leading-none tabular-nums"
            role="img"
            aria-label={`${r.rating} out of 5`}
          >
            {r.rating}
            <Star size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <strong className="font-medium">{r.clientName}</strong>
            <span className="text-fg-muted"> · {r.locationName}</span>
          </span>
          <span className="text-xs text-fg-muted">{ago(r.createdAt, now)}</span>
        </div>
        {r.comment ? <p className="mt-3 mb-0 text-sm">{r.comment}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {r.bestPart ? <Badge variant="quiet">Best: {r.bestPart}</Badge> : null}
          {r.improve ? <Badge variant="quiet">Improve: {r.improve}</Badge> : null}
          <Badge variant="quiet">{r.source === "qr" ? "QR" : "Link"}</Badge>
          {r.wantsContact ? <Badge variant="ink">Wants contact</Badge> : null}
          {r.reviewClicked ? <StatusBadge status="positive">Went to Google</StatusBadge> : null}
          {r.caseId ? <StatusBadge status="warning">Recovery case</StatusBadge> : null}
        </div>
        {me.canRequestSurveys ? (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={`/help?response=${r.id}&location=${r.locationId}`} />}
            >
              Ask for help about this
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* --------------------------------- forms --------------------------------- */

export function FormCard({
  form,
  onChanged,
  canManage,
  canOperate,
}: {
  form: SurveyForm;
  onChanged: () => void;
  canManage: boolean;
  canOperate: boolean;
}) {
  const [reviewUrl, setReviewUrl] = useState(form.reviewUrl ?? "");
  const [delay, setDelay] = useState(String(form.requestDelayMinutes));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await api.saveSurveySettings(form.locationId, {
        ...(canManage ? { reviewUrl: reviewUrl.trim() || null } : {}),
        ...(canOperate ? { requestDelayMinutes: Number(delay) } : {}),
      });
      setMessage({ ok: true, text: "Saved." });
      onChanged();
    } catch (e) {
      setMessage({
        ok: false,
        text:
          e instanceof ApiError && e.status === 422
            ? "Check the review link (https) and the delay (0 to 10080 minutes)."
            : "Could not save.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="md" title={form.locationName} description={form.clientName}>
      <div className="mt-4 grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col items-start gap-3">
          {form.qrUrl ? (
            <>
              <div className="rounded-sm border border-line bg-cream-100 p-3">
                <QRCodeSVG
                  value={form.qrUrl}
                  size={132}
                  bgColor="transparent"
                  fgColor="currentColor"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={form.qrUrl} label="Copy QR link" />
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<a href={form.qrUrl} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLink size={14} strokeWidth={1.5} /> Preview
                </Button>
              </div>
              {canManage ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      Rotate QR
                    </Button>
                  }
                  title="Rotate this QR?"
                  description="Every printed copy stops working. Print the new code before you rotate."
                  confirmLabel="Rotate QR"
                  onConfirm={() => api.rotateSurveyQr(form.locationId).then(onChanged)}
                />
              ) : null}
            </>
          ) : form.status !== "active" ? (
            <Banner status="info" title="Waiting for approval">
              {form.status === "pending"
                ? "The Atrium team is reviewing this place. Its QR appears here once it is approved."
                : "This place is not collecting answers right now."}
            </Banner>
          ) : (
            <Banner status="warning">QR signing is not configured on the server.</Banner>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <TextField
            label="Google review link"
            type="url"
            placeholder="https://g.page/r/…/review"
            value={reviewUrl}
            disabled={!canManage}
            onChange={(e) => setReviewUrl((e.target as HTMLInputElement).value)}
            hint={
              canManage
                ? "Every guest is offered this link after the survey. Required for Ask to send requests."
                : "Only the Atrium team can change this. Ask for help from the Help tab."
            }
          />
          <TextField
            label="Send delay (minutes)"
            inputMode="numeric"
            value={delay}
            disabled={!canOperate}
            onChange={(e) => setDelay((e.target as HTMLInputElement).value)}
            hint="How long after the visit Ask sends the request."
          />
          <div className="flex flex-wrap items-center gap-3">
            {canOperate || canManage ? (
              <Button size="sm" loading={saving} onClick={save}>
                Save settings
              </Button>
            ) : null}
            {message ? (
              <span className={message.ok ? "text-sm" : "text-sm text-clay-700"} role="status">
                {message.text}
              </span>
            ) : null}
          </div>

          {canOperate && form.status === "active" ? (
            <div className="border-t border-line pt-4">
              <Field label="One-time link">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => setLink((await api.surveyLink(form.locationId)).url)}
                  >
                    Generate link
                  </Button>
                  {link ? <CopyButton value={link} /> : null}
                </div>
              </Field>
              {link ? (
                <p className="mt-2 mb-0 text-xs break-all text-fg-muted">
                  {link} · works once, expires in 7 days
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function Forms({ canManage, canOperate }: { canManage: boolean; canOperate: boolean }) {
  const { data, failed, reload } = useLoad(api.surveyForms);
  return (
    <div className="flex flex-col gap-4">
      {failed ? <ErrorState title="Could not load forms" onRetry={reload} /> : null}
      {data === null && !failed ? <Skeleton className="h-40 w-full" /> : null}
      {data?.length === 0 ? (
        <EmptyState title="No locations yet">
          Add a client location to set up its survey.
        </EmptyState>
      ) : null}
      {data?.map((f) => (
        <FormCard
          key={`${f.locationId}:${f.qrVersion}`}
          form={f}
          onChanged={reload}
          canManage={canManage}
          canOperate={canOperate}
        />
      ))}
    </div>
  );
}

/* ---------------------------------- pages ---------------------------------- */

export function ResponsesPage() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader compact title="Responses" description="What guests answered after their visit." />
      {me.canReadSurveys ? <Responses /> : <NotAvailable />}
    </div>
  );
}

export function FormsPage() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title={me.kind === "client" ? "QR & links" : "Forms & QR"}
        description="How each place collects answers: its printed QR, one-time links and timing."
      />
      {me.canViewForms ? (
        <Forms canManage={me.canManageSurveys} canOperate={me.canOperateSurveys} />
      ) : (
        <NotAvailable />
      )}
    </div>
  );
}

export function HelpRequestsPage() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Help requests"
        description="What clients asked the Atrium team for."
      />
      {me.canViewForms ? (
        <HelpThreads canDecline={me.canManageSurveys} canWrite={me.canManageSurveys} />
      ) : (
        <NotAvailable />
      )}
    </div>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTACH_FAILED = "We could not attach that response.";

function HelpPanel() {
  const places = useLoad(api.surveyLocations);
  const [place, setPlace] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<{ responseId: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const options = (places.data ?? []).map((p: PlaceOption) => ({
    value: p.id,
    label: p.locationName,
  }));
  // "Ask for help about this" arrives as ?response=<id>&location=<id>: the place is preset when it
  // is one the person can pick.
  const linkedPlace = (() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("location");
    return id && options.some((o) => o.value === id) ? id : null;
  })();
  const chosen =
    place ?? linkedPlace ?? (options.length === 1 ? (options[0]?.value ?? null) : null);

  useEffect(() => {
    const responseId = new URLSearchParams(window.location.search).get("response");
    if (!responseId || !UUID.test(responseId)) return;
    let live = true;
    api
      .pickableResponses({ id: responseId })
      .then((found) => {
        if (!live) return;
        const hit = found.find((x) => x.id === responseId);
        if (hit) setAttachment({ responseId, label: `Survey response: ${hit.excerpt}` });
        else setAttachNote(ATTACH_FAILED);
      })
      .catch(() => {
        if (live) setAttachNote(ATTACH_FAILED);
      });
    return () => {
      live = false;
    };
  }, []);

  async function submit() {
    if (!chosen) return setError("Pick the place the form is for.");
    if (!note.trim()) return setError("Write a message first.");
    setBusy(true);
    setError(null);
    try {
      await api.requestSurvey(
        chosen,
        note,
        attachment ? { kind: "response", responseId: attachment.responseId } : undefined,
      );
      setNote("");
      setAttachment(null);
      setAttachNote(null);
      // The link has done its job: a reload must not stage the same response again.
      const url = new URL(window.location.href);
      url.searchParams.delete("response");
      url.searchParams.delete("location");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      setSent(true);
      setVersion((v) => v + 1);
    } catch {
      setError("We could not send the request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card padding="md" title="Ask for help">
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Place">
            <Select
              aria-label="Place"
              options={options}
              value={chosen}
              onValueChange={setPlace}
              placeholder="Choose a place"
            />
          </Field>
          <TextareaField
            label="What do you need?"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Change our Google review link, rotate the QR of the patio, anything else…"
          />
          {attachment ? (
            <p className="m-0 flex items-center gap-2 self-start rounded-sm border border-line px-3 py-1.5 text-sm">
              <Paperclip size={14} strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 truncate">{attachment.label}</span>
              <button
                type="button"
                aria-label="Remove attachment"
                className="cursor-pointer text-fg-muted hover:text-fg-strong"
                onClick={() => setAttachment(null)}
              >
                <X size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </p>
          ) : null}
          {attachNote ? <Banner status="warning">{attachNote}</Banner> : null}
          {error ? <Banner status="danger">{error}</Banner> : null}
          {sent ? <Banner status="positive">Request sent. We will get back to you.</Banner> : null}
          <Button loading={busy} onClick={submit}>
            Send request
          </Button>
        </div>
      </Card>
      <HelpThreads key={version} canDecline={false} canWrite />
    </div>
  );
}

export function HelpPage() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Ask for help"
        description="Tell the Atrium team what you need: a new QR, a change to your Google review link, anything else."
      />
      {me.canRequestSurveys ? <HelpPanel /> : <NotAvailable />}
    </div>
  );
}
