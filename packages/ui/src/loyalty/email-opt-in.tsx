"use client";

import { useState } from "react";
import { Button } from "../actions/button";
import { Banner } from "../feedback/banner";
import { TextField } from "../forms/input";
import { Checkbox } from "../forms/toggles";
import { type CardCopy, fill } from "./copy";

export type EmailResult = "ok" | "invalid_email" | "unavailable" | "rate_limited";

export type EmailOptInProps = {
  venue: string;
  copy: CardCopy;
  onSubmit: (email: string) => Promise<EmailResult>;
  done: boolean;
};

/** The optional email box. Nothing is sent until the guest ticks the consent box. */
export function EmailOptIn({ venue, copy, onSubmit, done }: EmailOptInProps) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [sent, setSent] = useState(false);

  if (done || sent) {
    return (
      <div role="status" className="rounded-card border border-charcoal-800 p-4 text-sm">
        {copy.emailDone}
      </div>
    );
  }

  const error =
    result === "invalid_email"
      ? copy.emailInvalid
      : result === "unavailable" || result === "rate_limited"
        ? copy.emailUnavailable
        : undefined;

  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-card border border-charcoal-800 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        if (!consent) {
          setRefused(true);
          return;
        }
        setBusy(true);
        setResult(null);
        try {
          const outcome = await onSubmit(email.trim());
          if (outcome === "ok") setSent(true);
          else setResult(outcome);
        } catch {
          setResult("unavailable");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <h2 className="m-0 font-serif text-xl">{copy.emailTitle}</h2>
        <p className="mt-1 mb-0 text-sm text-fg-muted">{copy.emailOptional}</p>
      </div>
      <TextField
        label={copy.emailLabel}
        type="email"
        autoComplete="email"
        inputMode="email"
        name="email"
        value={email}
        onChange={(event) => setEmail((event.target as HTMLInputElement).value)}
        error={error}
      />
      <Checkbox
        label={fill(copy.consent, { venue })}
        checked={consent}
        onCheckedChange={(next) => {
          setConsent(next);
          if (next) setRefused(false);
        }}
        aria-invalid={refused && !consent ? true : undefined}
      />
      <p className="m-0 text-xs text-fg-muted">{copy.unsubscribe}</p>
      <Button type="submit" loading={busy}>
        {copy.emailSubmit}
      </Button>
      {result === "rate_limited" ? <Banner status="warning">{copy.limitedBody}</Banner> : null}
    </form>
  );
}
