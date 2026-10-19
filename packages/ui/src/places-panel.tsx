"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "./actions/button";
import { api, type Place, type PlaceStatus } from "./api";
import { Card } from "./data/card";
import { Skeleton } from "./data/misc";
import { StatusBadge } from "./feedback/badge";
import { Banner } from "./feedback/banner";
import { EmptyState, ErrorState } from "./feedback/states";
import { TextField } from "./forms/input";
import { PageHeader } from "./layout/layout";
import { linkedRowProps, useQueryParam } from "./lib/query-param";
import { useMe } from "./shell/me-context";
import { NotAvailable } from "./shell/not-available";

export const PLACE_STATUS: Record<
  PlaceStatus,
  { status: "positive" | "warning" | "neutral"; word: string }
> = {
  active: { status: "positive", word: "Active" },
  pending: { status: "warning", word: "Waiting for approval" },
  suspended: { status: "neutral", word: "Paused" },
  rejected: { status: "neutral", word: "Not approved" },
};

type PlacesClient = {
  places: () => Promise<Place[]>;
  requestPlace: (name: string, timeZone: string) => Promise<unknown>;
};

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
};

/** The owner's places with their status, and the way to ask for another one. */
export function PlacesPanel({ client = api }: { client?: PlacesClient }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const linkedPlace = useQueryParam("place");
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [zone, setZone] = useState(browserZone);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    client
      .places()
      .then((p) => {
        setPlaces(p);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [client]);
  useEffect(load, [load]);

  async function submit() {
    if (!name.trim()) return setError("Give the place a name.");
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await client.requestPlace(name.trim(), zone.trim());
      setName("");
      setSent(true);
      load();
    } catch {
      setError("We could not send the request. Check the time zone (like America/Chicago).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-normal">Your places</h2>
        {failed ? <ErrorState title="Could not load your places" onRetry={load} /> : null}
        {places === null && !failed ? <Skeleton className="h-20 w-full" /> : null}
        {places?.length === 0 ? (
          <EmptyState title="No places yet">Ask for your first place on the right.</EmptyState>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Your places">
          {places?.map((p) => {
            const s = PLACE_STATUS[p.status];
            return (
              <li key={p.id} {...linkedRowProps(p.id === linkedPlace)}>
                <Card padding="sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <strong className="min-w-0 flex-1 font-medium">{p.name}</strong>
                    <StatusBadge status={s.status}>{s.word}</StatusBadge>
                  </div>
                  {p.status === "pending" ? (
                    <p className="mt-2 mb-0 text-sm text-fg-muted">
                      The Atrium team reviews new places. Guests cannot answer for it until then.
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
      <Card padding="md" title="Add a place">
        <div className="mt-4 flex flex-col gap-4">
          <TextField
            label="Name of the place"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <TextField
            label="Time zone"
            value={zone}
            hint="For example America/Chicago. It decides when guests are asked."
            onChange={(e) => setZone((e.target as HTMLInputElement).value)}
          />
          {error ? <Banner status="danger">{error}</Banner> : null}
          {sent ? (
            <Banner status="positive">Request sent to the Atrium team. We will tell you.</Banner>
          ) : null}
          <Button loading={busy} onClick={submit}>
            Ask for this place
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function PlacesPage() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="My places"
        description="Your places and where each one stands. New places are reviewed by the Atrium team."
      />
      {me.canRequestLocations ? <PlacesPanel /> : <NotAvailable />}
    </div>
  );
}
