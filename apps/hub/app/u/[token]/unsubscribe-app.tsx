"use client";

import { Button, Container, EmptyState } from "@atrium/ui";
import { useEffect, useState } from "react";

type State = "loading" | "ready" | "done" | "invalid" | "failed";

/** One confirmation, then consent is withdrawn. Repeating it is harmless. */
export function UnsubscribeApp({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const base = `/unsubscribe-api/${encodeURIComponent(token)}`;

  useEffect(() => {
    fetch(`${base}/info`)
      .then((res) => setState(res.ok ? "ready" : "invalid"))
      .catch(() => setState("failed"));
  }, [base]);

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(base, { method: "POST" });
      setState(res.ok ? "done" : "failed");
    } catch {
      setState("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="py-16">
      {state === "loading" ? null : state === "invalid" ? (
        <EmptyState title="This link is not valid">
          Check that you opened the whole link from the email.
        </EmptyState>
      ) : state === "done" ? (
        <EmptyState title="You are unsubscribed">
          You will not get more email from us. This is safe to repeat.
        </EmptyState>
      ) : state === "failed" ? (
        <EmptyState title="Something went wrong">Try again in a moment.</EmptyState>
      ) : (
        <EmptyState
          title="Stop emails from this restaurant?"
          action={
            <Button onClick={confirm} loading={busy}>
              Unsubscribe
            </Button>
          }
        />
      )}
    </Container>
  );
}
