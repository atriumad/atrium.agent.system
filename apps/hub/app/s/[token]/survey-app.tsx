"use client";

import {
  Banner,
  Button,
  Card,
  ChipGroup,
  Container,
  Emphasis,
  Eyebrow,
  Field,
  RatingScale,
  Skeleton,
  Switch,
  TextareaField,
  TextField,
  Wordmark,
} from "@atrium/ui";
import { type FormEvent, useEffect, useState } from "react";

const BEST_PART = ["food", "service", "atmosphere", "value", "speed", "drinks"] as const;
const IMPROVE = [
  "food",
  "service",
  "atmosphere",
  "value",
  "speed",
  "cleanliness",
  "nothing",
] as const;
const label = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

type Info =
  | { state: "loading" }
  | { state: "ready"; locationName: string }
  | { state: "dead"; reason: string }
  | { state: "offline" };

type Done = { reviewUrl: string | null };

const DEAD_COPY: Record<string, string> = {
  used: "This link was already used. Thank you for your feedback.",
  expired: "This link has expired.",
  unknown: "This link is not valid.",
};

/** `invitation` is a one-time link; `qr` is the printed code at a table. */
export function SurveyApp({
  token,
  kind = "invitation",
}: {
  token: string;
  kind?: "invitation" | "qr";
}) {
  const base = kind === "qr" ? "/qr-api" : "/survey-api";
  const [info, setInfo] = useState<Info>({ state: "loading" });
  const [rating, setRating] = useState<number | null>(null);
  const [bestPart, setBestPart] = useState<string | null>(null);
  const [improve, setImprove] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [wantsContact, setWantsContact] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    fetch(`${base}/${encodeURIComponent(token)}/info`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (res.ok) setInfo({ state: "ready", locationName: body.locationName });
        else setInfo({ state: "dead", reason: body.error ?? "unknown" });
      })
      .catch(() => setInfo({ state: "offline" }));
  }, [token, base]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rating === null) return setError("Pick how your visit was.");
    if (wantsContact && !email.trim() && !phone.trim())
      return setError("Add an email or a phone so we can reach you.");
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`${base}/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating,
          bestPart: rating >= 4 ? bestPart : null,
          improve: rating <= 3 ? improve : null,
          comment: comment || null,
          wantsContact,
          contactName: wantsContact ? name || null : null,
          contactEmail: wantsContact ? email || null : null,
          contactPhone: wantsContact ? phone || null : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setDone({ reviewUrl: body.reviewUrl ?? null });
      else if (res.status === 410) setInfo({ state: "dead", reason: "used" });
      else if (res.status === 429) setError("This device already answered. Thank you.");
      else setError("We could not send that. Check the form and try again.");
    } catch {
      setError("We could not reach the server. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Container className="max-w-xl py-10">
      <Wordmark size="sm" />
      <div className="mt-8">
        {info.state === "loading" ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : info.state === "offline" ? (
          <Banner status="danger" title="Cannot reach the server">
            Try again in a moment.
          </Banner>
        ) : info.state === "dead" ? (
          <Banner status="neutral" title="Link unavailable">
            {DEAD_COPY[info.reason] ?? DEAD_COPY.unknown}
          </Banner>
        ) : done ? (
          <Card tone="lime" padding="lg" title="Thank you">
            <p className="text-sm">Your answer reached the team at {info.locationName}.</p>
            {wantsContact ? (
              <p className="mt-2 text-sm">Someone will be in touch with you.</p>
            ) : null}
            {done.reviewUrl ? (
              <Button
                className="mt-5"
                variant="primary"
                render={<a href={done.reviewUrl} target="_blank" rel="noreferrer" />}
              >
                Share it on Google
              </Button>
            ) : null}
          </Card>
        ) : (
          <form onSubmit={submit} className="space-y-7" noValidate>
            <div>
              <Eyebrow>Your visit</Eyebrow>
              <h1 className="mt-3 text-4xl leading-tight">
                How was <Emphasis>{info.locationName}?</Emphasis>
              </h1>
            </div>

            <Field label="Rating">
              <RatingScale
                aria-label="How was your visit?"
                value={rating}
                onValueChange={setRating}
              />
            </Field>

            {rating !== null && rating >= 4 ? (
              <Field label="What was best?" optional>
                <ChipGroup
                  aria-label="Best part"
                  value={bestPart ? [bestPart] : []}
                  onValueChange={(v: string[]) => setBestPart(v[0] ?? null)}
                  options={BEST_PART.map((v) => ({ value: v, label: label(v) }))}
                />
              </Field>
            ) : null}
            {rating !== null && rating <= 3 ? (
              <Field label="What should we improve?" optional>
                <ChipGroup
                  aria-label="What to improve"
                  value={improve ? [improve] : []}
                  onValueChange={(v: string[]) => setImprove(v[0] ?? null)}
                  options={IMPROVE.map((v) => ({ value: v, label: label(v) }))}
                />
              </Field>
            ) : null}

            <TextareaField
              label="Anything else?"
              optional
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <Switch
              label="I would like someone to contact me"
              checked={wantsContact}
              onCheckedChange={setWantsContact}
            />
            {wantsContact ? (
              <div className="space-y-4">
                <TextField
                  label="Name"
                  optional
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName((e.target as HTMLInputElement).value)}
                />
                <TextField
                  label="Email"
                  type="email"
                  optional
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
                />
                <TextField
                  label="Phone"
                  type="tel"
                  optional
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone((e.target as HTMLInputElement).value)}
                  hint="Email or phone, whichever you prefer."
                />
              </div>
            ) : null}

            {error ? <Banner status="danger">{error}</Banner> : null}
            <Button type="submit" loading={sending} fullWidth>
              Send
            </Button>
          </form>
        )}
      </div>
    </Container>
  );
}
