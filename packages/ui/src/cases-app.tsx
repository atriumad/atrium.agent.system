"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api, type CaseDetail, type CaseSummary, type Me } from "./api";
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

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-alert text-white",
  medium: "bg-amber text-ink",
  low: "bg-line text-ink",
};

const TONE_STYLE = {
  ok: "text-ink-soft",
  soon: "text-amber font-semibold",
  overdue: "text-alert font-semibold",
};

export function CasesApp({ surface }: { surface: Surface }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setMe(null);
        else setUnreachable(true);
      });
  }, []);

  if (unreachable) {
    return (
      <Shell>
        <p role="alert" className="mt-16 text-center text-alert">
          Cannot reach the server. Check that the API is running, then reload.
        </p>
      </Shell>
    );
  }

  if (me === undefined) return <Shell>{null}</Shell>;
  if (me === null)
    return (
      <Shell>
        <SignIn surface={surface} onDone={() => location.reload()} />
      </Shell>
    );
  return (
    <Shell>
      <Workspace surface={surface} me={me} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>;
}

function SignIn({ surface, onDone }: { surface: Surface; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api.signIn(String(form.get("email")), String(form.get("password")));
      onDone();
    } catch {
      setError("That email and password do not match.");
      setBusy(false);
    }
  }

  return (
    <form
      // POST, so a submit before the page has hydrated never puts the password in the URL.
      method="post"
      onSubmit={submit}
      className="mx-auto mt-16 max-w-sm rounded-2xl border border-line bg-paper p-6"
    >
      <p className="text-sm text-ink-soft">{surface === "manager" ? "Atrium Manager" : "Atrium"}</p>
      <h1 className="mt-1 font-serif text-3xl">Sign in</h1>
      <label className="mt-6 block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="username"
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
      />
      <label className="mt-4 block text-sm font-medium" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
      />
      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-ink px-4 py-2 font-medium text-cream disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function Workspace({ surface, me }: { surface: Surface; me: Me }) {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    api
      .cases()
      .then((rows) => {
        setCases(rows);
        setFailed(false);
        setNow(new Date());
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const showClient = me.kind !== "client";
  const visible = (cases ?? []).filter((c) => inTab(c.status, tab));
  const count = (t: Tab) => (cases ?? []).filter((c) => inTab(c.status, t)).length;
  const overdue = (cases ?? []).filter(
    (c) => dueLabel(c.status, c.dueAt, now)?.tone === "overdue",
  ).length;

  async function signOut() {
    await api.signOut().catch(() => undefined);
    location.reload();
  }

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl">{COPY[surface].title}</h1>
          <p className="mt-1 text-ink-soft">{COPY[surface].blurb}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{me.name}</p>
          <p className="text-ink-soft">{me.role.replaceAll("_", " ")}</p>
          <button type="button" onClick={signOut} className="mt-1 underline">
            Sign out
          </button>
        </div>
      </header>

      {overdue > 0 ? (
        <p
          role="status"
          className="mt-6 rounded-lg bg-alert px-4 py-2 text-sm font-medium text-white"
        >
          {overdue} {overdue === 1 ? "case is" : "cases are"} past the 24-hour target.
        </p>
      ) : null}

      <nav aria-label="Filter by status" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-sm capitalize ${
              tab === t ? "border-ink bg-ink text-cream" : "border-line bg-paper"
            }`}
          >
            {t} <span className="opacity-60">{count(t)}</span>
          </button>
        ))}
      </nav>

      {failed ? (
        <p role="alert" className="mt-6 text-alert">
          Could not load cases. Retrying.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul className="space-y-2">
          {cases === null ? <li className="text-ink-soft">Loading…</li> : null}
          {cases !== null && visible.length === 0 ? (
            <li className="rounded-xl border border-dashed border-line p-6 text-ink-soft">
              {tab === "active" ? "Nothing needs follow-up right now." : "No cases here."}
            </li>
          ) : null}
          {visible.map((c) => (
            <CaseRow
              key={c.id}
              item={c}
              now={now}
              showClient={showClient}
              active={selected === c.id}
              onSelect={() => setSelected(c.id)}
            />
          ))}
        </ul>
        <div className="lg:sticky lg:top-6 lg:self-start">
          {selected ? (
            <Detail
              key={selected}
              id={selected}
              me={me}
              now={now}
              onChanged={load}
              onClose={() => setSelected(null)}
            />
          ) : (
            <p className="hidden rounded-xl border border-dashed border-line p-6 text-ink-soft lg:block">
              Pick a case to read what the guest said.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function CaseRow(props: {
  item: CaseSummary;
  now: Date;
  showClient: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const { item, now } = props;
  const due = dueLabel(item.status, item.dueAt, now);
  return (
    <li>
      <button
        type="button"
        onClick={props.onSelect}
        aria-current={props.active}
        className={`w-full rounded-xl border p-4 text-left ${
          props.active ? "border-ink bg-white" : "border-line bg-paper hover:border-ink-soft"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[item.severity]}`}
          >
            {SEVERITY_LABEL[item.severity]}
          </span>
          <span className="text-sm" aria-label={`Rating ${item.rating} of 5`}>
            {"★".repeat(item.rating)}
            <span className="opacity-25">{"★".repeat(5 - item.rating)}</span>
          </span>
        </div>
        <p className="mt-2 font-medium">
          {props.showClient ? `${item.clientName} · ` : ""}
          {item.locationName}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-soft">
          <span>{STATUS_LABEL[item.status]}</span>
          <span>opened {ago(item.openedAt, now)}</span>
          {due ? <span className={TONE_STYLE[due.tone]}>{due.text}</span> : null}
        </p>
      </button>
    </li>
  );
}

function Detail(props: {
  id: string;
  me: Me;
  now: Date;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [item, setItem] = useState<CaseDetail | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .detail(props.id)
      .then(setItem)
      .catch(() => setError("Could not load this case."));
  }, [props.id]);

  async function move(to: "contacted" | "resolved") {
    setBusy(true);
    setError(null);
    try {
      setItem(await api.advance(props.id, to, note));
      setNote("");
      props.onChanged();
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
    return (
      <p role={error ? "alert" : undefined} className="rounded-xl border border-line bg-paper p-6">
        {error ?? "Loading…"}
      </p>
    );
  }
  const due = dueLabel(item.status, item.dueAt, props.now);
  const { response } = item;
  return (
    <article className="rounded-2xl border border-line bg-paper p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">
            {item.clientName} · {item.locationName}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {STATUS_LABEL[item.status]} · opened {ago(item.openedAt, props.now)}
            {due ? <span className={`ml-2 ${TONE_STYLE[due.tone]}`}>{due.text}</span> : null}
          </p>
        </div>
        <button type="button" onClick={props.onClose} className="text-sm underline lg:hidden">
          Close
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-soft">Rating</dt>
        <dd>{item.rating} of 5</dd>
        {response.bestPart ? (
          <>
            <dt className="text-ink-soft">Liked</dt>
            <dd>{answerLabel(response.bestPart)}</dd>
          </>
        ) : null}
        {response.improve ? (
          <>
            <dt className="text-ink-soft">To improve</dt>
            <dd>{answerLabel(response.improve)}</dd>
          </>
        ) : null}
      </dl>

      {response.comment ? (
        <figure className="mt-5">
          <figcaption className="text-xs uppercase tracking-wide text-ink-soft">
            What the guest wrote
          </figcaption>
          {/* Third-party text: React renders it as text. It is never markup or an instruction. */}
          <blockquote className="mt-1 whitespace-pre-wrap rounded-lg border-l-4 border-line bg-white p-3">
            {response.comment}
          </blockquote>
        </figure>
      ) : null}

      <section className="mt-5">
        <h3 className="text-xs uppercase tracking-wide text-ink-soft">How to reach them</h3>
        {item.contact ? (
          <ul className="mt-1 space-y-1">
            {item.contact.email ? (
              <li>
                <a className="underline" href={`mailto:${item.contact.email}`}>
                  {item.contact.email}
                </a>
              </li>
            ) : null}
            {item.contact.phone ? (
              <li>
                <a className="underline" href={`tel:${item.contact.phone}`}>
                  {item.contact.phone}
                </a>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-1 text-ink-soft">
            {item.wantsContact
              ? "They asked to be contacted but left no details we can use."
              : "They did not ask to be contacted. Do not reach out; use this to improve."}
          </p>
        )}
      </section>

      {item.note ? (
        <section className="mt-5">
          <h3 className="text-xs uppercase tracking-wide text-ink-soft">Team note</h3>
          <p className="mt-1 whitespace-pre-wrap">{item.note}</p>
        </section>
      ) : null}

      {item.status === "resolved" ? (
        <p className="mt-5 text-sm text-ok">
          Resolved {ago(item.resolvedAt ?? item.openedAt, props.now)}.
        </p>
      ) : props.me.canWorkCases ? (
        <section className="mt-6 border-t border-line pt-5">
          <label htmlFor="note" className="text-sm font-medium">
            Note for the record (optional)
          </label>
          <textarea
            id="note"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-line bg-white p-2"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {item.status === "open" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => move("contacted")}
                className="rounded-lg border border-ink px-4 py-2 font-medium disabled:opacity-50"
              >
                Mark contacted
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => move("resolved")}
              className="rounded-lg bg-lime px-4 py-2 font-medium text-ink disabled:opacity-50"
            >
              Resolve
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-alert">
              {error}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-soft">
          Your account manager works this case and will close it.
        </p>
      )}
    </article>
  );
}
