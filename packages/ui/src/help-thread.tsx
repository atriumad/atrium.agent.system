"use client";

import { ExternalLink, Paperclip, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "./actions/button";
import {
  ApiError,
  api,
  type HelpAttachmentInput,
  type HelpThreadData,
  type Me,
  type PickableResponse,
  type SurveyRequest,
  type ThreadAttachment,
  type ThreadMessage,
} from "./api";
import { Skeleton } from "./data/misc";
import { StatusBadge } from "./feedback/badge";
import { Banner } from "./feedback/banner";
import { EmptyState, ErrorState } from "./feedback/states";
import { ago } from "./format";
import { TextareaField, TextField } from "./forms/input";
import { Select } from "./forms/select";
import { ListPanel, ROW_PAD } from "./layout/list-panel";
import { cx } from "./lib/cx";
import { queryParam } from "./lib/query-param";
import { useMe } from "./shell/me-context";

type Side = "client" | "agency";

const STATUS = {
  open: { status: "warning", word: "Waiting" },
  fulfilled: { status: "positive", word: "Solved" },
  dismissed: { status: "neutral", word: "Declined" },
} as const;

const SEND_FAILED = "We could not send that. Try again.";
const CLOSE_FAILED = "We could not close it. Try again.";
const ATTACHMENT_GONE = "That response is not available for this client.";

const isAttachmentGone = (e: unknown) => e instanceof ApiError && e.code === "attachment_not_found";

const viewerSideOf = (me: Me): Side => (me.kind === "client" ? "client" : "agency");

/** "You" only for your own messages; a colleague on your side is named, with the side. */
function sideLabel(side: Side, viewer: Side, mine: boolean): string {
  if (mine) return "You";
  return side === "agency" ? "Atrium team" : "The client";
}

function turnLabel(awaiting: Side | null, viewer: Side): string | null {
  if (!awaiting) return null;
  if (awaiting === viewer) return "Waiting for you";
  return viewer === "client" ? "Waiting for Atrium" : "Waiting for the client";
}

/** Runs `fn` every `ms` while the tab is visible, and when the window regains focus. */
function usePoll(fn: () => void, ms: number) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const timer = setInterval(run, ms);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [ms]);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function AttachmentCard({ attachment }: { attachment: ThreadAttachment }) {
  if (attachment.kind === "response") {
    const r = attachment.response;
    if (!r) {
      return (
        <p className="m-0 mt-3 rounded-sm border border-line px-3 py-2 text-sm text-fg-muted">
          This response is no longer available.
        </p>
      );
    }
    const labels = [r.sentiment, ...r.topics, r.concern, r.safety ? "Safety concern" : null].filter(
      (v): v is string => Boolean(v),
    );
    return (
      <div className="mt-3 flex flex-col gap-1.5 rounded-sm border border-line bg-surface-card px-3 py-2.5 text-sm text-fg-body">
        <p className="m-0 text-xs text-fg-muted">
          Survey response · {r.locationName} · {new Date(r.createdAt).toLocaleDateString()}
        </p>
        <p className="m-0 font-medium text-fg-strong">{r.rating}/5</p>
        {r.comment ? <p className="m-0 whitespace-pre-wrap">{r.comment}</p> : null}
        {r.bestPart ? <p className="m-0">Best part: {r.bestPart}</p> : null}
        {r.improve ? <p className="m-0">To improve: {r.improve}</p> : null}
        {labels.length > 0 ? (
          <p className="m-0 text-xs text-fg-muted">{labels.join(" · ")}</p>
        ) : null}
      </div>
    );
  }
  const safe = attachment.url.startsWith("https://");
  return (
    <div className="mt-3 flex flex-col gap-1.5 rounded-sm border border-line bg-surface-card px-3 py-2.5 text-sm text-fg-body">
      <p className="m-0 text-xs text-fg-muted">External review</p>
      {safe ? (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start font-medium text-fg-strong underline underline-offset-2"
        >
          {hostOf(attachment.url)}
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
        </a>
      ) : (
        <span className="font-medium text-fg-strong">{hostOf(attachment.url)}</span>
      )}
      {attachment.rating !== null ? <p className="m-0">{attachment.rating}/5</p> : null}
      {attachment.text ? <p className="m-0 whitespace-pre-wrap">{attachment.text}</p> : null}
    </div>
  );
}

function Message({
  message,
  viewer,
  me,
  now,
}: {
  message: ThreadMessage;
  viewer: Side;
  me: Me;
  now: Date;
}) {
  const own = message.side === viewer;
  const mine = own && message.authorName === me.name;
  return (
    <li className={cx("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "w-full max-w-[85%] rounded-md border px-4 py-3",
          own ? "border-line bg-surface-sunken" : "border-line bg-surface-card",
        )}
      >
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-xs text-fg-muted">
          <span className="font-medium text-fg-strong">{message.authorName}</span>
          <span>{sideLabel(message.side, viewer, mine)}</span>
          <span>{ago(message.createdAt, now)}</span>
        </p>
        <p className="m-0 mt-1.5 text-sm whitespace-pre-wrap text-fg-body">{message.body}</p>
        {message.attachment ? <AttachmentCard attachment={message.attachment} /> : null}
      </div>
    </li>
  );
}

type Attached = { input: HelpAttachmentInput; label: string };
type Picker = "review" | "response" | null;

const RATING_OPTIONS = [
  { value: "", label: "No rating" },
  ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} of 5` })),
];

function ReviewForm({ onAdd, onCancel }: { onAdd: (a: Attached) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    let ok = false;
    try {
      ok = new URL(url.trim()).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) return setError("Use the https link of the review.");
    const input: HelpAttachmentInput = {
      kind: "review",
      url: url.trim(),
      ...(rating ? { rating: Number(rating) } : {}),
      ...(text.trim() ? { text: text.trim() } : {}),
    };
    onAdd({ input, label: `External review · ${hostOf(url.trim())}` });
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-line p-3">
      <TextField
        label="Review link"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={url}
        onChange={(e) => {
          setUrl((e.target as HTMLInputElement).value);
          setError(null);
        }}
        error={error}
      />
      <TextareaField
        label="Review text"
        optional
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="max-w-48">
        <Select
          aria-label="Review rating"
          options={RATING_OPTIONS}
          value={rating}
          onValueChange={(v) => setRating(v ?? "")}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={add}>
          Add review
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ResponsePicker({
  requestId,
  onAdd,
  onCancel,
}: {
  requestId: string;
  onAdd: (a: Attached) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<PickableResponse[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    api
      .pickableResponses({ requestId })
      .then(setItems)
      .catch(() => setFailed(true));
  }, [requestId]);
  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-line p-3">
      {failed ? <ErrorState title="Could not load responses" onRetry={load} /> : null}
      {items === null && !failed ? <Skeleton className="h-10 w-full" /> : null}
      {items?.length === 0 ? (
        <p className="m-0 text-sm text-fg-muted">There are no responses to attach yet.</p>
      ) : null}
      {items && items.length > 0 ? (
        <ListPanel aria-label="Survey responses">
          {items.map((r) => {
            const when = new Date(r.createdAt).toLocaleDateString();
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() =>
                    onAdd({
                      input: { kind: "response", responseId: r.id },
                      label: `Survey response · ${r.rating}/5 · ${r.excerpt}`,
                    })
                  }
                  className="block w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-sunken"
                >
                  {when} · {r.locationName} · {r.rating}/5 · {r.excerpt}
                </button>
              </li>
            );
          })}
        </ListPanel>
      ) : null}
      <div>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Composer({
  request,
  canDecline,
  onDone,
}: {
  request: SurveyRequest;
  canDecline: boolean;
  onDone: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [menu, setMenu] = useState(false);
  const attachButton = useRef<HTMLButtonElement>(null);
  const attachPanel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [picker, setPicker] = useState<Picker>(null);
  const [busy, setBusy] = useState<"send" | "fulfilled" | "dismissed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = request.status === "open";

  // The Attach disclosure: focus moves into it when it opens; Escape or a click outside closes it
  // and puts focus back on the button.
  useEffect(() => {
    if (!menu) return;
    attachPanel.current?.querySelector("button")?.focus();
    const giveFocusBack = () => {
      const active = document.activeElement;
      if (!active || active === document.body || attachPanel.current?.contains(active)) {
        attachButton.current?.focus();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      attachButton.current?.focus();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (attachPanel.current?.contains(target) || attachButton.current?.contains(target)) return;
      setMenu(false);
      giveFocusBack();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [menu]);

  function choose(p: Exclude<Picker, null>) {
    setMenu(false);
    setPicker(p);
  }

  function add(a: Attached) {
    setAttached(a);
    setPicker(null);
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      await api.postHelpMessage(request.id, draft, attached?.input);
    } catch (e) {
      setError(isAttachmentGone(e) ? ATTACHMENT_GONE : SEND_FAILED);
      setBusy(null);
      return;
    }
    setDraft("");
    setAttached(null);
    setBusy(null);
    await onDone();
  }

  async function close(to: "fulfilled" | "dismissed") {
    setError(null);
    if (attached && !draft.trim()) {
      setError("Add a message to go with the attachment.");
      return;
    }
    setBusy(to);
    if (attached) {
      // The close call carries no attachment, so post the message first. Once it is posted the
      // draft and the attachment are spent: clear them, so a retry cannot post it twice.
      try {
        await api.postHelpMessage(request.id, draft, attached.input);
      } catch (e) {
        setError(isAttachmentGone(e) ? ATTACHMENT_GONE : CLOSE_FAILED);
        setBusy(null);
        return;
      }
      setDraft("");
      setAttached(null);
      try {
        await api.closeHelpRequest(request.id, to);
      } catch {
        setError(CLOSE_FAILED);
        setBusy(null);
        await onDone();
        return;
      }
    } else {
      try {
        await api.closeHelpRequest(request.id, to, draft);
      } catch {
        setError(CLOSE_FAILED);
        setBusy(null);
        return;
      }
      setDraft("");
    }
    setBusy(null);
    await onDone();
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      {error ? <Banner status="danger">{error}</Banner> : null}
      <TextareaField
        label="Message"
        rows={3}
        maxLength={2000}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {attached ? (
        <p className="m-0 flex items-center gap-2 self-start rounded-sm border border-line px-3 py-1.5 text-sm">
          <Paperclip size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 truncate">{attached.label}</span>
          <button
            type="button"
            aria-label="Remove attachment"
            className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center text-fg-muted hover:text-fg-strong"
            onClick={() => setAttached(null)}
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </p>
      ) : null}
      {picker === "review" ? <ReviewForm onAdd={add} onCancel={() => setPicker(null)} /> : null}
      {picker === "response" ? (
        <ResponsePicker requestId={request.id} onAdd={add} onCancel={() => setPicker(null)} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={busy === "send"} disabled={!draft.trim() || busy !== null} onClick={send}>
          Send
        </Button>
        <div className="relative">
          <Button
            ref={attachButton}
            variant="outline"
            icon={<Paperclip size={16} strokeWidth={1.5} aria-hidden="true" />}
            aria-expanded={menu}
            aria-controls={panelId}
            disabled={busy !== null}
            onClick={() => setMenu((v) => !v)}
          >
            Attach
          </Button>
          {menu ? (
            <div
              id={panelId}
              ref={attachPanel}
              className="absolute top-full left-0 z-10 mt-1 min-w-48 rounded-md border border-line bg-surface-card p-1"
            >
              {(
                [
                  ["review", "External review"],
                  ["response", "Survey response"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => choose(key)}
                  className="block w-full cursor-pointer rounded-sm px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {open ? (
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              loading={busy === "fulfilled"}
              disabled={busy !== null}
              onClick={() => close("fulfilled")}
            >
              Mark as solved
            </Button>
            {canDecline ? (
              <Button
                variant="ghost"
                loading={busy === "dismissed"}
                disabled={busy !== null}
                onClick={() => close("dismissed")}
              >
                Decline
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Conversation({
  id,
  canDecline,
  canWrite,
  pollMs,
  onChanged,
  focusNow,
  onFocused,
}: {
  id: string;
  canDecline: boolean;
  canWrite: boolean;
  pollMs: number;
  onChanged: () => void;
  focusNow: boolean;
  onFocused: () => void;
}) {
  const me = useMe();
  const viewer = viewerSideOf(me);
  const region = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [data, setData] = useState<HelpThreadData | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    return api
      .helpThread(id)
      .then((d) => {
        setData(d);
        setFailed(false);
        setNow(new Date());
      })
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  usePoll(() => void load(), pollMs);

  const done = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  const request = data?.request ?? null;

  // After the person picks a request, bring the conversation into view and move focus to its
  // heading once it is on screen (on a phone it sits below the list).
  const ready = request !== null;
  useEffect(() => {
    if (!focusNow || !ready) return;
    region.current?.scrollIntoView?.({ block: "start" });
    heading.current?.focus();
    onFocused();
  }, [focusNow, ready, onFocused]);

  const s = request ? STATUS[request.status] : null;

  return (
    <section
      ref={region}
      aria-label="Conversation"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface-card p-5"
    >
      {failed ? (
        <ErrorState title="Could not load this conversation" onRetry={() => void load()} />
      ) : null}
      {data === null && !failed ? <Skeleton className="h-24 w-full" /> : null}
      {request && s ? (
        <>
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={s.status}>{s.word}</StatusBadge>
            <h2
              ref={heading}
              tabIndex={-1}
              className="m-0 min-w-0 flex-1 text-lg font-medium text-fg-strong"
            >
              {request.locationName}
              <span className="text-sm font-normal text-fg-muted">
                {me.kind !== "client" ? ` · ${request.clientName}` : ""} · {request.requestedByName}
              </span>
            </h2>
          </header>
          <ul aria-label="Messages" className="m-0 flex list-none flex-col gap-3 p-0">
            {data?.messages.map((m) => (
              <Message key={m.id} message={m} viewer={viewer} me={me} now={now} />
            ))}
          </ul>
          {canWrite ? <Composer request={request} canDecline={canDecline} onDone={done} /> : null}
        </>
      ) : null}
    </section>
  );
}

function Row({
  item,
  viewer,
  showClient,
  active,
  now,
  onSelect,
}: {
  item: SurveyRequest;
  viewer: Side;
  showClient: boolean;
  active: boolean;
  now: Date;
  onSelect: () => void;
}) {
  const s = STATUS[item.status];
  const turn = item.status === "open" ? turnLabel(item.awaiting, viewer) : null;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cx(
          "block w-full cursor-pointer text-left transition-colors hover:bg-surface-sunken",
          ROW_PAD,
          active && "bg-surface-sunken",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge status={s.status}>{s.word}</StatusBadge>
          <span className="text-xs text-fg-muted">
            {ago(item.lastMessageAt ?? item.createdAt, now)}
          </span>
        </div>
        <p className="mt-2 mb-1 text-base">
          <span>{item.locationName}</span>
          {showClient ? <span className="text-fg-muted"> · {item.clientName}</span> : null}
        </p>
        {item.lastPreview ? (
          <p className="m-0 line-clamp-2 text-sm text-fg-muted">{item.lastPreview}</p>
        ) : null}
        {turn ? (
          <p
            className={cx(
              "m-0 mt-1.5 text-sm",
              item.awaiting === viewer ? "font-medium text-fg-strong" : "text-fg-muted",
            )}
          >
            {turn}
          </p>
        ) : null}
      </button>
    </li>
  );
}

/**
 * The help conversations of the signed-in person: the list on one side, the open thread on the other.
 * The Manager shows every client's, Platform shows the client's own; `canDecline` is the agency's.
 */
export function HelpThreads({
  canDecline,
  canWrite = true,
  pollMs = 15_000,
  initialSelected = null,
}: {
  canDecline: boolean;
  canWrite?: boolean;
  pollMs?: number;
  initialSelected?: string | null;
}): ReactNode {
  const me = useMe();
  const viewer = viewerSideOf(me);
  const [requests, setRequests] = useState<SurveyRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialSelected);
  // A notification links here as ?request=<id>.
  useEffect(() => {
    const linked = queryParam("request");
    if (linked && !initialSelected) setSelected(linked);
  }, [initialSelected]);
  const [focusNow, setFocusNow] = useState(false);
  const stopFocusing = useCallback(() => setFocusNow(false), []);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    api
      .surveyRequests()
      .then((rows) => {
        setRequests(rows);
        setFailed(false);
        setNow(new Date());
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);
  usePoll(load, pollMs);

  const showGrid = requests === null ? !failed : requests.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {failed ? <ErrorState title="Could not load help requests" onRetry={load} /> : null}
      {requests?.length === 0 ? (
        <EmptyState title="No help requests">
          {me.kind === "client"
            ? "Ask for help from the Help page."
            : "When a client asks for help, it shows up here."}
        </EmptyState>
      ) : null}
      {showGrid ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <ListPanel aria-label="Help requests" aria-busy={requests === null || undefined}>
            {requests === null
              ? [0, 1, 2].map((i) => (
                  <li key={i} className={ROW_PAD}>
                    <div className="flex flex-col gap-2.5">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="w-3/4" />
                      <Skeleton className="w-1/2" />
                    </div>
                  </li>
                ))
              : requests.map((r) => (
                  <Row
                    key={r.id}
                    item={r}
                    viewer={viewer}
                    showClient={me.kind !== "client"}
                    active={selected === r.id}
                    now={now}
                    onSelect={() => {
                      setSelected(r.id);
                      setFocusNow(true);
                    }}
                  />
                ))}
          </ListPanel>
          <div className="lg:sticky lg:top-6">
            {selected ? (
              <Conversation
                key={selected}
                id={selected}
                canDecline={canDecline}
                canWrite={canWrite}
                pollMs={pollMs}
                onChanged={load}
                focusNow={focusNow}
                onFocused={stopFocusing}
              />
            ) : (
              <p className="m-0 hidden rounded-md border border-dashed border-charcoal-400 p-6 text-fg-muted lg:block">
                Pick a request to read the conversation.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
