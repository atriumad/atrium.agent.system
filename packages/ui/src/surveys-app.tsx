"use client";

import { Check, Copy, ExternalLink, Star } from "lucide-react";
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
import { PageHeader } from "./layout/layout";
import { SectionNav } from "./navigation/section-nav";
import { Tabs } from "./navigation/tabs";
import { PlacesPanel } from "./places-panel";
import { Account, SessionGate } from "./session";

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
        await navigator.clipboard?.writeText(value).catch(() => undefined);
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
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Survey responses">
          {data?.map((r) => (
            <ResponseCard key={r.id} r={r} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResponseCard({ r, now }: { r: SurveyResponse; now: Date }) {
  return (
    <li>
      <Card padding="sm">
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
      </Card>
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

/* -------------------------------- requests -------------------------------- */

const REQUEST_STATUS = {
  open: { status: "warning", word: "Waiting" },
  fulfilled: { status: "positive", word: "Done" },
  dismissed: { status: "neutral", word: "Declined" },
} as const;

function RequestRow({
  request,
  now,
  onHandled,
}: {
  request: SurveyRequest;
  now: Date;
  onHandled?: (() => void) | undefined;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const s = REQUEST_STATUS[request.status];

  async function handle(to: "fulfilled" | "dismissed") {
    setBusy(true);
    await api.handleSurveyRequest(request.id, to, reply).catch(() => undefined);
    setBusy(false);
    onHandled?.();
  }

  return (
    <li>
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={s.status}>{s.word}</StatusBadge>
          <span className="min-w-0 flex-1 text-sm">
            <strong className="font-medium">{request.locationName}</strong>
            <span className="text-fg-muted">
              {" "}
              · {request.clientName} · {request.requestedByName}
            </span>
          </span>
          <span className="text-xs text-fg-muted">{ago(request.createdAt, now)}</span>
        </div>
        {request.note ? <p className="mt-3 mb-0 text-sm">{request.note}</p> : null}
        {request.response ? (
          <p className="mt-3 mb-0 text-sm text-fg-muted">Agency: {request.response}</p>
        ) : null}
        {onHandled && request.status === "open" ? (
          <div className="mt-4 flex flex-col gap-3">
            <TextareaField
              label="Reply to the client"
              optional
              rows={2}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={() => handle("fulfilled")}>
                Mark done
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => handle("dismissed")}>
                Decline
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </li>
  );
}

function Requests() {
  const { data, failed, reload } = useLoad(api.surveyRequests);
  const now = new Date();
  return (
    <div className="flex flex-col gap-4">
      {failed ? <ErrorState title="Could not load requests" onRetry={reload} /> : null}
      {data === null && !failed ? <Skeleton className="h-24 w-full" /> : null}
      {data?.length === 0 ? (
        <EmptyState title="No requests">
          When a client asks for a survey form, it shows up here.
        </EmptyState>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Survey requests">
        {data?.map((r) => (
          <RequestRow key={r.id} request={r} now={now} onHandled={reload} />
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------- pages ---------------------------------- */

type AdminTab = "responses" | "forms" | "requests";

/** The Manager's survey area: for the agency, never the client. */
export function SurveysAdminApp() {
  return <SessionGate surface="manager">{(me) => <AdminWorkspace me={me} />}</SessionGate>;
}

function AdminWorkspace({ me }: { me: Me }) {
  const [tab, setTab] = useState<AdminTab>("responses");
  const open = useLoad(api.surveyRequests).data?.filter((r) => r.status === "open").length;
  return (
    <div className="flex flex-col gap-6">
      <SectionNav
        links={[
          { href: "/", label: "Cases" },
          { href: "/surveys", label: "Surveys", current: true },
          ...(me.canManageLocations ? [{ href: "/approvals", label: "Approvals" }] : []),
        ]}
      />
      <PageHeader
        eyebrow="Reputation"
        title="Surveys"
        description="What guests answered, how each place collects answers, and what clients asked for."
        actions={<Account me={me} />}
      />
      {!me.canReadSurveys ? (
        <Banner status="neutral" title="Not available for your role">
          Surveys are run by the agency.
        </Banner>
      ) : (
        <>
          <Tabs
            label="Survey sections"
            value={tab}
            onValueChange={(v) => setTab(v as AdminTab)}
            items={[
              { value: "responses", label: "Responses" },
              { value: "forms", label: "Forms and links" },
              { value: "requests", label: "Requests", ...(open ? { count: open } : {}) },
            ]}
          />
          {tab === "responses" ? <Responses /> : null}
          {tab === "forms" ? (
            <Forms canManage={me.canManageSurveys} canOperate={me.canOperateSurveys} />
          ) : null}
          {tab === "requests" ? <Requests /> : null}
        </>
      )}
      {me.canReadSurveys && !me.canManageSurveys ? (
        <Banner status="info">Your role can read surveys but not change them.</Banner>
      ) : null}
    </div>
  );
}

/** The Platform's survey area: the owner runs the day to day, the agency helps when asked. */
export function SurveysClientApp() {
  return <SessionGate surface="platform">{(me) => <ClientWorkspace me={me} />}</SessionGate>;
}

type ClientTab = "responses" | "locations" | "places" | "help";

function HelpPanel() {
  const places = useLoad(api.surveyLocations);
  const requests = useLoad(api.surveyRequests);
  const [place, setPlace] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const options = (places.data ?? []).map((p: PlaceOption) => ({
    value: p.id,
    label: p.locationName,
  }));
  const chosen = place ?? (options.length === 1 ? (options[0]?.value ?? null) : null);

  async function submit() {
    if (!chosen) return setError("Pick the place the form is for.");
    setBusy(true);
    setError(null);
    try {
      await api.requestSurvey(chosen, note);
      setNote("");
      setSent(true);
      requests.reload();
    } catch {
      setError("We could not send the request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
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
            optional
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Change our Google review link, rotate the QR of the patio, anything else…"
          />
          {error ? <Banner status="danger">{error}</Banner> : null}
          {sent ? <Banner status="positive">Request sent. We will get back to you.</Banner> : null}
          <Button loading={busy} onClick={submit}>
            Send request
          </Button>
        </div>
      </Card>
      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-normal">Your requests</h2>
        {requests.data === null && !requests.failed ? <Skeleton className="h-20 w-full" /> : null}
        {requests.data?.length === 0 ? (
          <EmptyState title="Nothing yet">Your requests and our answers show up here.</EmptyState>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Your requests">
          {requests.data?.map((r) => (
            <RequestRow key={r.id} request={r} now={now} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ClientWorkspace({ me }: { me: Me }) {
  const tabs: { value: ClientTab; label: string }[] = [
    ...(me.canReadSurveys ? [{ value: "responses" as const, label: "Responses" }] : []),
    ...(me.canViewForms ? [{ value: "locations" as const, label: "My locations" }] : []),
    ...(me.canRequestLocations ? [{ value: "places" as const, label: "My places" }] : []),
    ...(me.canRequestSurveys ? [{ value: "help" as const, label: "Help" }] : []),
  ];
  const [tab, setTab] = useState<ClientTab | null>(null);
  const current = tab ?? tabs[0]?.value ?? null;
  return (
    <div className="flex flex-col gap-6">
      <SectionNav
        links={[
          { href: "/", label: "Feedback" },
          { href: "/surveys", label: "Surveys", current: true },
        ]}
      />
      <PageHeader
        eyebrow="Reputation"
        title="Surveys"
        description="What your guests said, the QR and links for each of your places, and a way to ask the Atrium team for help."
        actions={<Account me={me} />}
      />
      {current === null ? (
        <Banner status="neutral" title="Not available for your role">
          Ask the account owner for access.
        </Banner>
      ) : (
        <>
          <Tabs
            label="Survey sections"
            value={current}
            onValueChange={(v) => setTab(v as ClientTab)}
            items={tabs}
          />
          {current === "responses" ? <Responses /> : null}
          {current === "locations" ? (
            <Forms canManage={false} canOperate={me.canOperateSurveys} />
          ) : null}
          {current === "places" ? <PlacesPanel /> : null}
          {current === "help" ? <HelpPanel /> : null}
        </>
      )}
    </div>
  );
}
