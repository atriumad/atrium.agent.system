"use client";

import { type FormEvent, useState } from "react";
import { Button } from "./actions/button";
import { Banner } from "./feedback/banner";
import { TextField } from "./forms/input";

/** Where a new owner lands from the link the approver handed over. The token comes from it. */
export function SetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== repeat) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (res.ok) setDone(true);
      else if (res.status === 400)
        setError("This link has expired or is not valid. Ask for a new one.");
      else setError("We could not set the password. Try again.");
    } catch {
      setError("We could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <Banner status="danger">This link is not valid. Ask for a new one.</Banner>;
  }
  if (done) {
    return (
      <Banner status="positive" title="Your password is set">
        You can sign in now. <a href="/">Go to sign in</a>
      </Banner>
    );
  }
  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate>
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
      />
      <TextField
        label="Repeat the password"
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat((e.target as HTMLInputElement).value)}
      />
      {error ? <Banner status="danger">{error}</Banner> : null}
      <Button type="submit" loading={busy}>
        Set password
      </Button>
    </form>
  );
}
