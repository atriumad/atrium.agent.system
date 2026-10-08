"use client";

import { type FormEvent, useState } from "react";
import { Button } from "./actions/button";
import { Banner } from "./feedback/banner";
import { TextareaField, TextField } from "./forms/input";

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
};

/** The public form for a business that wants to join. It asks; the Atrium team decides. */
export function RequestAccessForm() {
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [firstLocationName, setFirstLocationName] = useState("");
  const [timeZone, setTimeZone] = useState(browserZone);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (![businessName, ownerName, ownerEmail, firstLocationName].every((v) => v.trim())) {
      return setError("Fill in every field except the note.");
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/onboarding-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessName,
          ownerName,
          ownerEmail,
          firstLocationName,
          firstLocationTimeZone: timeZone,
          note,
        }),
      });
      if (res.status === 429) setError("Too many requests from this address. Try again later.");
      else setDone(true);
    } catch {
      setError("We could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Banner status="positive" title="We got your request">
        The Atrium team will review it and write to the email you gave. There is nothing else to do
        for now.
      </Banner>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField
        label="Business name"
        value={businessName}
        onChange={(e) => setBusinessName((e.target as HTMLInputElement).value)}
      />
      <TextField
        label="Your name"
        value={ownerName}
        onChange={(e) => setOwnerName((e.target as HTMLInputElement).value)}
      />
      <TextField
        label="Your email"
        type="email"
        value={ownerEmail}
        onChange={(e) => setOwnerEmail((e.target as HTMLInputElement).value)}
      />
      <TextField
        label="First place"
        hint="The restaurant or location you want to start with."
        value={firstLocationName}
        onChange={(e) => setFirstLocationName((e.target as HTMLInputElement).value)}
      />
      <TextField
        label="Time zone"
        hint="For example America/Chicago."
        value={timeZone}
        onChange={(e) => setTimeZone((e.target as HTMLInputElement).value)}
      />
      <TextareaField
        label="Anything we should know?"
        optional
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <Banner status="danger">{error}</Banner> : null}
      <Button type="submit" loading={busy}>
        Request access
      </Button>
    </form>
  );
}
