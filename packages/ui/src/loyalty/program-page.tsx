"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../actions/button";
import { ApiError, api, type LoyaltyProgram, type LoyaltyProgramInput, type Place } from "../api";
import { Card } from "../data/card";
import { Skeleton } from "../data/misc";
import { writeParams } from "../data/write-params";
import { Banner } from "../feedback/banner";
import { EmptyState, ErrorState } from "../feedback/states";
import { Field } from "../forms/field";
import { TextField } from "../forms/input";
import { NumberField } from "../forms/number-field";
import { Select } from "../forms/select";
import { Radio, RadioGroup, Switch } from "../forms/toggles";
import { PageHeader } from "../layout/layout";
import { queryParam } from "../lib/query-param";
import { useMe } from "../shell/me-context";
import { NotAvailable } from "../shell/not-available";
import { ModulePage } from "../shell/teaser";
import { ACCENT_STYLE, LOYALTY_ACCENTS, type LoyaltyAccent } from "./accent";
import { LoyaltyCardFace, type LoyaltyCardView } from "./card-face";
import { CARD_COPY } from "./copy";
import { JoinQrPanel } from "./join-qr-panel";

/** What an API failure means for a loyalty page: the module is locked, the role may not, or it broke. */
export function loyaltyFailure(e: unknown): "locked" | "forbidden" | "error" {
  if (e instanceof ApiError && e.status === 403) {
    return e.code === "feature_locked" ? "locked" : "forbidden";
  }
  return "error";
}

export const PROGRAM_DEFAULTS: LoyaltyProgramInput = {
  name: "Loyalty card",
  stampsRequired: 8,
  rewardLabel: "",
  cooldownMinutes: 240,
  active: true,
  accent: "lime",
};

type Draft = {
  name: string;
  stampsRequired: number | null;
  rewardLabel: string;
  cooldownMinutes: number | null;
  active: boolean;
  accent: LoyaltyAccent;
};

type Errors = Partial<
  Record<"name" | "stampsRequired" | "rewardLabel" | "cooldownMinutes", string>
>;

function check(d: Draft): Errors {
  const errors: Errors = {};
  const name = d.name.trim();
  if (name.length < 1 || name.length > 120)
    errors.name = "Give the card a name (1 to 120 characters).";
  if (
    d.stampsRequired === null ||
    !Number.isInteger(d.stampsRequired) ||
    d.stampsRequired < 2 ||
    d.stampsRequired > 20
  ) {
    errors.stampsRequired = "Choose 2 to 20 stamps.";
  }
  const reward = d.rewardLabel.trim();
  if (reward.length < 1 || reward.length > 80) {
    errors.rewardLabel = "Give the reward a name (1 to 80 characters).";
  }
  if (
    d.cooldownMinutes === null ||
    !Number.isInteger(d.cooldownMinutes) ||
    d.cooldownMinutes < 0 ||
    d.cooldownMinutes > 1440
  ) {
    errors.cooldownMinutes = "Choose 0 to 1440 minutes.";
  }
  return errors;
}

const draftOf = (p: LoyaltyProgram | null): Draft => {
  const v = p ?? PROGRAM_DEFAULTS;
  return {
    name: v.name,
    stampsRequired: v.stampsRequired,
    rewardLabel: v.rewardLabel,
    cooldownMinutes: v.cooldownMinutes,
    active: v.active,
    accent: v.accent,
  };
};

type Failure = "locked" | "forbidden" | "error" | null;

/** Program setup for one place: the form, the card as the guest will see it, and the join QR. */
export function LoyaltyProgramPage() {
  const me = useMe();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);

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
  useEffect(loadPlaces, [loadPlaces]);

  if (!me.canReadLoyalty) return <NotAvailable />;
  if (failure === "locked") return <ModulePage feature="retention" />;

  const place = places?.find((p) => p.id === placeId) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Program & QR"
        description="The stamp card for a place, the QR guests scan to join, and what to print."
      />
      {failure === "forbidden" ? <NotAvailable /> : null}
      {failure === "error" ? (
        <ErrorState title="Could not load your places" onRetry={loadPlaces} />
      ) : null}
      {places === null && !failure ? <Skeleton className="h-20 w-full" /> : null}
      {places?.length === 0 ? (
        <EmptyState title="No places yet">
          A loyalty card belongs to an approved place. Ask for one under My places.
        </EmptyState>
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
      {places && places.length > 1 && !place ? (
        <p className="m-0 text-fg-muted">Choose a place to see its card.</p>
      ) : null}
      {place ? (
        <ProgramEditor
          key={place.id}
          place={place}
          canManage={me.canManageLoyalty}
          onLocked={() => setFailure("locked")}
        />
      ) : null}
    </div>
  );
}

function ProgramEditor({
  place,
  canManage,
  onLocked,
}: {
  place: Place;
  canManage: boolean;
  onLocked: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ status: "positive" | "danger"; text: string } | null>(
    null,
  );

  const load = useCallback(() => {
    setFailure(null);
    api
      .loyaltyProgram(place.id)
      .then((p) => setDraft(draftOf(p)))
      .catch((e) => {
        const kind = loyaltyFailure(e);
        if (kind === "locked") onLocked();
        else setFailure(kind);
      });
  }, [place.id, onLocked]);
  useEffect(load, [load]);

  if (failure === "forbidden") return <NotAvailable />;
  if (failure) return <ErrorState title="Could not load the program" onRetry={load} />;
  if (!draft) return <Skeleton className="h-64 w-full" />;

  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setMessage(null);
  };

  async function save() {
    if (!draft) return;
    const found = check(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await api.saveLoyaltyProgram(place.id, {
        name: draft.name.trim(),
        stampsRequired: draft.stampsRequired as number,
        rewardLabel: draft.rewardLabel.trim(),
        cooldownMinutes: draft.cooldownMinutes as number,
        active: draft.active,
        accent: draft.accent,
      });
      setDraft(draftOf(saved));
      setMessage({ status: "positive", text: "Program saved." });
    } catch (e) {
      const kind = loyaltyFailure(e);
      if (kind === "locked") return onLocked();
      const detail = e instanceof ApiError && e.status === 422 ? e.detail.message : null;
      setMessage({
        status: "danger",
        text:
          typeof detail === "string"
            ? detail
            : kind === "forbidden"
              ? "Only the owner or the Atrium team can change the program."
              : "We could not save the program. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const stamps =
    draft.stampsRequired !== null && draft.stampsRequired >= 2
      ? Math.min(20, draft.stampsRequired)
      : PROGRAM_DEFAULTS.stampsRequired;
  const view: LoyaltyCardView = {
    state: draft.active ? "active" : "paused",
    locationName: place.name,
    programName: draft.name.trim() || PROGRAM_DEFAULTS.name,
    rewardLabel: draft.rewardLabel.trim() || "Your reward",
    accent: draft.accent,
    stampsRequired: stamps,
    stampsInCycle: Math.min(3, stamps - 1),
    rewardReady: false,
    shortCode: "",
    etag: "preview",
  };
  const disabled = !canManage;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <Card padding="md" title="Program">
          <form
            className="mt-4 flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <TextField
              label="Name"
              value={draft.name}
              error={errors.name}
              inputProps={{ disabled, maxLength: 120 }}
              onChange={(e) => set({ name: (e.target as HTMLInputElement).value })}
            />
            <div className="flex flex-col gap-1">
              <NumberField
                label="Stamps needed"
                min={2}
                max={20}
                step={1}
                disabled={disabled}
                value={draft.stampsRequired}
                onValueChange={(v) => set({ stampsRequired: v })}
              />
              {errors.stampsRequired ? (
                <span role="alert" className="text-xs text-clay-600 dark:text-clay-300">
                  {errors.stampsRequired}
                </span>
              ) : null}
            </div>
            <TextField
              label="Reward"
              value={draft.rewardLabel}
              error={errors.rewardLabel}
              hint={`${draft.rewardLabel.length} of 80 characters`}
              inputProps={{ disabled, maxLength: 80 }}
              onChange={(e) => set({ rewardLabel: (e.target as HTMLInputElement).value })}
            />
            <div className="flex flex-col gap-1">
              <NumberField
                label="Cooldown (minutes)"
                hint="4 hours is 240"
                min={0}
                max={1440}
                step={1}
                disabled={disabled}
                value={draft.cooldownMinutes}
                onValueChange={(v) => set({ cooldownMinutes: v })}
              />
              {errors.cooldownMinutes ? (
                <span role="alert" className="text-xs text-clay-600 dark:text-clay-300">
                  {errors.cooldownMinutes}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <span className="label-caps text-fg-muted">Accent</span>
              <RadioGroup
                aria-label="Accent"
                className="flex-row flex-wrap gap-4"
                value={draft.accent}
                disabled={disabled}
                onValueChange={(v) => set({ accent: v as LoyaltyAccent })}
              >
                {LOYALTY_ACCENTS.map((a) => (
                  <Radio
                    key={a}
                    value={a}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-5 rounded-full border border-charcoal-900 ${ACCENT_STYLE[a].fill}`}
                        />
                        {ACCENT_STYLE[a].label}
                      </span>
                    }
                  />
                ))}
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-1">
              <Switch
                label="Active"
                checked={draft.active}
                disabled={disabled}
                onCheckedChange={(v) => set({ active: v })}
              />
              <span className="text-xs text-fg-muted">
                A paused card still opens and keeps its stamps; it cannot be stamped.
              </span>
            </div>
            {message ? <Banner status={message.status}>{message.text}</Banner> : null}
            {canManage ? (
              <div>
                <Button type="submit" loading={busy}>
                  Save program
                </Button>
              </div>
            ) : (
              <p className="m-0 text-sm text-fg-muted">
                Only the owner or the Atrium team can change the program.
              </p>
            )}
          </form>
        </Card>
        {canManage ? <JoinQrPanel locationId={place.id} /> : null}
      </div>
      <Card padding="md" title="Preview" description="What a guest sees, with 3 stamps collected.">
        <div className="mt-4 max-w-sm">
          <LoyaltyCardFace view={view} copy={CARD_COPY.en} />
        </div>
      </Card>
    </div>
  );
}
