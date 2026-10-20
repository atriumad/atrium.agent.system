"use client";

import { ScanLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../actions/button";
import { ApiError, api, type Place, type StaffCard } from "../api";
import { Card } from "../data/card";
import { Skeleton } from "../data/misc";
import { writeParams } from "../data/write-params";
import { StatusBadge } from "../feedback/badge";
import { Dialog } from "../feedback/overlays";
import { EmptyState, ErrorState } from "../feedback/states";
import { Field } from "../forms/field";
import { Textarea, TextField } from "../forms/input";
import { Select } from "../forms/select";
import { PageHeader } from "../layout/layout";
import { queryParam } from "../lib/query-param";
import { useMe } from "../shell/me-context";
import { NotAvailable } from "../shell/not-available";
import { ModulePage } from "../shell/teaser";
import { formatCardCode, normalizeCardCode, parseScannedCode } from "./code";
import { createKeyRing, type KeyAction } from "./keys";
import { loyaltyFailure } from "./program-page";
import { barcodeScanner, type CardScanner } from "./scanner";
import { StampGrid } from "./stamp-grid";

const HINT = "Do not write guest details (names, phone numbers or emails).";
const STATE_BADGE = {
  active: { status: "positive", label: "Active" },
  paused: { status: "warning", label: "Paused" },
  closed: { status: "neutral", label: "Closed" },
} as const;
const KIND_LABEL: Record<string, string> = {
  stamp: "Stamp",
  reward_earned: "Reward earned",
  reward_redeemed: "Reward redeemed",
  void: "Stamp voided",
};

/** What the staff type, shown as ABCD-EFGH. */
function typedCode(input: string): string {
  const clean = input
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  return clean.length > 4 ? formatCardCode(clean) : clean;
}

/** Answers the server decided: the key is spent. Anything else (network, 5xx, 429) may be retried with it. */
const decided = (e: unknown) =>
  e instanceof ApiError && (e.status === 404 || e.status === 409 || e.status === 422);

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function nextStampTime(retryAt: unknown, now: Date): string | null {
  if (typeof retryAt !== "string") return null;
  const at = new Date(retryAt);
  if (Number.isNaN(at.getTime())) return null;
  return sameDay(at, now)
    ? at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : at.toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
}

function failureText(e: unknown, now: Date): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return "No card with that code at this place.";
    if (e.status === 429) return "Too many tries. Wait a minute and try again.";
    if (e.status === 409) {
      if (e.code === "refused") {
        const reason = e.detail.reason;
        if (reason === "cooldown") {
          const time = nextStampTime(e.detail.retryAt, now);
          return time
            ? `Already stamped recently. Next stamp from ${time}.`
            : "Already stamped recently.";
        }
        if (reason === "paused") return "This program is paused.";
        if (reason === "closed") return "This card is closed.";
      }
      if (e.code === "no_reward") return "This card has no reward to redeem.";
      if (e.code === "nothing_to_void") return "There is no stamp to void in this cycle.";
    }
    if (e.status === 422) {
      const message = e.detail.message;
      if (typeof message === "string") return message;
    }
  }
  return "That did not go through. Check the connection and try again.";
}

type Failure = "locked" | "forbidden" | "error" | null;

/** The staff stamp screen: find or scan a card, then stamp, redeem or void with client keys. */
export function LoyaltyStampPage({
  scanner = barcodeScanner,
  now = () => new Date(),
}: {
  scanner?: CardScanner;
  now?: () => Date;
}) {
  const me = useMe();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  // Lives above the desk: remounting it on a place change must not mint a new key for an in-doubt action.
  const ring = useMemo(() => createKeyRing(), []);

  const loadPlaces = useCallback(() => {
    setFailure(null);
    api
      .places()
      .then((all) => {
        const active = all.filter((p) => p.status === "active");
        setPlaces(active);
        const wanted = queryParam("place");
        const hit = active.find((p) => p.id === wanted);
        setPlaceId(hit ? hit.id : active.length === 1 ? (active[0]?.id ?? null) : null);
      })
      .catch((e) => setFailure(loyaltyFailure(e)));
  }, []);
  const canStamp = me.canStampLoyalty;
  useEffect(() => {
    if (canStamp) loadPlaces();
  }, [canStamp, loadPlaces]);
  const onLocked = useCallback(() => setFailure("locked"), []);

  if (!me.canStampLoyalty) return <NotAvailable />;
  if (failure === "locked") return <ModulePage feature="retention" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Stamp a card"
        description="Find a card by its code or scan it, then add a stamp."
      />
      {failure === "forbidden" ? <NotAvailable /> : null}
      {failure === "error" ? (
        <ErrorState title="Could not load your places" onRetry={loadPlaces} />
      ) : null}
      {places === null && !failure ? <Skeleton className="h-20 w-full" /> : null}
      {places?.length === 0 ? (
        <EmptyState title="No places yet">A loyalty card belongs to an approved place.</EmptyState>
      ) : null}
      {places && places.length > 1 ? (
        <Field label="Place" className="max-w-sm">
          <Select
            aria-label="Place"
            placeholder="Choose a place"
            options={places.map((p) => ({ value: p.id, label: p.name }))}
            value={placeId}
            onValueChange={(v) => {
              setPlaceId(v);
              writeParams({ place: v }, "replace", false);
            }}
          />
        </Field>
      ) : null}
      {places && places.length > 1 && !placeId ? (
        <p className="m-0 text-fg-muted">Choose a place to stamp its cards.</p>
      ) : null}
      {placeId ? (
        <StampDesk
          key={placeId}
          locationId={placeId}
          ring={ring}
          scanner={scanner}
          now={now}
          onLocked={onLocked}
        />
      ) : null}
    </div>
  );
}

function StampDesk({
  locationId,
  ring,
  scanner,
  now,
  onLocked,
}: {
  locationId: string;
  ring: ReturnType<typeof createKeyRing>;
  scanner: CardScanner;
  now: () => Date;
  onLocked: () => void;
}) {
  const me = useMe();
  const inflight = useRef(false);
  const [text, setText] = useState("");
  const [card, setCard] = useState<StaffCard | null>(null);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  // The action went through but the card could not be read again: the count on screen is old.
  const [stale, setStale] = useState(false);
  const [retry, setRetry] = useState<KeyAction | null>(null);
  const [animate, setAnimate] = useState<number | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");

  // Closed or unmounted: the camera goes off. A start that resolves late is stopped at once.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [scanError, setScanError] = useState("");
  const onCodeRef = useRef<(raw: string) => void>(() => undefined);
  useEffect(() => {
    if (!scanOpen || !video) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    setScanError("");
    scanner
      .start(video, (raw) => onCodeRef.current(raw))
      .then((fn) => {
        if (cancelled) fn();
        else stop = fn;
      })
      .catch(() => {
        if (!cancelled) setScanError("The camera could not start. Type the code instead.");
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [scanOpen, video, scanner]);

  const lookup = useCallback(
    async (raw: string, afterAction = false) => {
      const code = normalizeCardCode(raw);
      if (!code) {
        setError("Enter the 8-character code, like ABCD-EFGH.");
        return;
      }
      setFinding(true);
      setError("");
      setRetry(null);
      try {
        setCard(await api.loyaltyCard(locationId, code));
        setStale(false);
      } catch (e) {
        const kind = loyaltyFailure(e);
        if (kind === "locked") return onLocked();
        if (afterAction) {
          // Keep the card and the success message; never read as a failed action.
          setStale(true);
          setError(
            "Done, but the card could not be refreshed. Find it again to see the new count.",
          );
          return;
        }
        setCard(null);
        setStale(false);
        setError(failureText(e, now()));
      } finally {
        setFinding(false);
      }
    },
    [locationId, onLocked, now],
  );

  onCodeRef.current = (raw) => {
    const code = parseScannedCode(raw);
    if (!code) {
      setScanError("That QR is not an Atrium card.");
      return;
    }
    setScanOpen(false);
    setText(formatCardCode(code));
    setStatus("");
    void lookup(code);
  };

  /** One staff action: one in-flight request, one key per (action, card) until the server decides. */
  async function act(
    action: KeyAction,
    cardKey: string,
    send: (key: string) => Promise<unknown>,
    done: (result: unknown) => string,
  ) {
    if (inflight.current || !card) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    setRetry(null);
    const code = normalizeCardCode(card.shortCode) ?? card.shortCode;
    try {
      const result = await send(ring.keyFor(action, cardKey));
      ring.settle(action, cardKey);
      setStatus(done(result));
      if (action === "void") {
        setVoidOpen(false);
        setReason("");
      }
      if (action === "stamp") setAnimate((result as { stampsInCycle: number }).stampsInCycle - 1);
      else setAnimate(null);
      await lookup(code, true);
    } catch (e) {
      if (decided(e)) ring.settle(action, cardKey);
      else setRetry(action);
      const kind = loyaltyFailure(e);
      if (kind === "locked") onLocked();
      else {
        setError(kind === "forbidden" ? "You cannot do this." : failureText(e, now()));
        if (decided(e) && action === "void") setVoidOpen(false);
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const code = card ? (normalizeCardCode(card.shortCode) ?? card.shortCode) : "";
  const stamp = () =>
    act(
      "stamp",
      `${locationId}:${code}`,
      (key) => api.loyaltyStamp({ locationId, code, idempotencyKey: key }),
      (r) => {
        const s = r as { stampsInCycle: number; stampsRequired: number; rewardEarned: boolean };
        return s.rewardEarned
          ? `Card complete. The reward is ready: ${card?.rewardLabel ?? ""}.`
          : `Stamp added. ${s.stampsInCycle} of ${s.stampsRequired}.`;
      },
    );
  const redeem = () =>
    act(
      "redeem",
      `${locationId}:${code}`,
      (key) => api.loyaltyRedeem({ locationId, code, idempotencyKey: key }),
      () => "Reward redeemed.",
    );
  const trimmed = reason.trim();
  const voidIt = () => {
    if (!card || trimmed.length < 1 || trimmed.length > 200) return;
    void act(
      "void",
      card.cardId,
      (key) => api.loyaltyVoid({ cardId: card.cardId, reason: trimmed, idempotencyKey: key }),
      () => "Last stamp voided.",
    );
  };

  const errorNode = error ? (
    <p role="alert" className="m-0 text-sm text-clay-600 dark:text-clay-300">
      {error}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setStatus("");
          void lookup(text);
        }}
      >
        <TextField
          label="Card code"
          className="w-full max-w-xs"
          value={text}
          placeholder="XXXX-XXXX"
          autoComplete="off"
          onChange={(e) => setText(typedCode((e.target as HTMLInputElement).value))}
          inputProps={{ autoCapitalize: "characters", autoCorrect: "off", spellCheck: false }}
        />
        <Button type="submit" loading={finding}>
          Find card
        </Button>
        {scanner.supported() ? (
          <Button
            type="button"
            variant="outline"
            icon={<ScanLine size={16} aria-hidden="true" />}
            onClick={() => setScanOpen(true)}
          >
            Scan card
          </Button>
        ) : null}
      </form>
      <Dialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Scan card"
        description="Point the camera at the QR on the guest's card."
      >
        <video
          ref={setVideo}
          muted
          playsInline
          className="aspect-square w-full rounded-card bg-charcoal-900 object-cover"
        />
        {scanError ? (
          <p role="alert" className="mt-3 mb-0 text-sm text-clay-600 dark:text-clay-300">
            {scanError}
          </p>
        ) : null}
      </Dialog>
      <div role="status" aria-live="polite" className="empty:hidden text-fg-strong">
        {status}
      </div>
      {voidOpen ? null : errorNode}
      {card ? (
        <Card padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="m-0 font-serif text-[40px] leading-none tabular-nums tracking-wider">
                {formatCardCode(code)}
              </p>
              <p className="mt-2 mb-0 text-sm text-fg-muted">{card.locationName}</p>
            </div>
            <StatusBadge status={STATE_BADGE[card.state].status}>
              {STATE_BADGE[card.state].label}
            </StatusBadge>
          </div>
          <div className="mt-5 max-w-sm">
            <StampGrid
              required={card.stampsRequired}
              filled={card.stampsInCycle}
              accent={card.accent}
              animateIndex={animate}
              label={`${card.stampsInCycle} of ${card.stampsRequired} stamps`}
            />
          </div>
          <p className="mt-4 mb-0">
            <span className="font-serif text-3xl tabular-nums">{card.stampsInCycle}</span>{" "}
            <em>of</em>{" "}
            <span className="font-serif text-3xl tabular-nums">{card.stampsRequired}</span>
            <span className="ml-3 text-fg-muted">{card.rewardLabel}</span>
          </p>
          {card.rewardsPending > 0 ? (
            <p className="mt-2 mb-0 font-medium">
              Reward ready
              {` (${card.rewardsPending} pending)`}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              loading={busy}
              disabled={stale || card.state !== "active" || !me.canStampLoyalty}
              onClick={() => void stamp()}
            >
              {retry === "stamp" ? "Try again" : "Add stamp"}
            </Button>
            {card.rewardsPending > 0 && me.canRedeemLoyalty ? (
              <Button
                variant="outline"
                size="lg"
                disabled={busy || stale}
                onClick={() => void redeem()}
              >
                {retry === "redeem" ? "Try again" : "Redeem reward"}
              </Button>
            ) : null}
            {me.canManageLoyalty ? (
              <Button
                variant="ghost"
                size="lg"
                disabled={busy || stale}
                onClick={() => {
                  setError("");
                  setVoidOpen(true);
                }}
              >
                Void last stamp
              </Button>
            ) : null}
          </div>
          {card.recent.length > 0 ? (
            <ul className="mt-5 mb-0 flex list-none flex-col gap-1 p-0 text-sm text-fg-muted">
              {card.recent.slice(0, 5).map((r) => (
                <li key={r.id}>
                  {new Date(r.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {KIND_LABEL[r.kind] ?? r.kind}
                  {r.actorName ? ` · ${r.actorName}` : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
      <Dialog
        open={voidOpen}
        onOpenChange={(o) => !busy && setVoidOpen(o)}
        title="Void last stamp"
        description="This removes the latest stamp of the current cycle."
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button variant="clay" loading={busy} disabled={trimmed.length < 1} onClick={voidIt}>
              {retry === "void" ? "Try again" : "Confirm"}
            </Button>
          </>
        }
      >
        <Field label="Reason">
          <Textarea value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="mt-2 mb-0 text-xs text-fg-muted">{HINT}</p>
        <p aria-live="polite" className="mt-1 mb-0 text-xs text-fg-muted">
          {reason.length} of 200 characters
        </p>
        {voidOpen ? <div className="mt-3">{errorNode}</div> : null}
      </Dialog>
    </div>
  );
}
