"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "./actions/button";
import { ApiError, api, type OnboardingRequest, type Place } from "./api";
import { Card } from "./data/card";
import { Skeleton } from "./data/misc";
import { Badge } from "./feedback/badge";
import { Banner } from "./feedback/banner";
import { ConfirmDialog } from "./feedback/overlays";
import { EmptyState, ErrorState } from "./feedback/states";
import { ago } from "./format";
import { TextareaField } from "./forms/input";
import { PageHeader } from "./layout/layout";
import { PLACE_STATUS } from "./places-panel";
import { useFrame } from "./shell/frame-context";
import { useMe } from "./shell/me-context";
import { NotAvailable } from "./shell/not-available";

type ApprovalsClient = {
  onboardingRequests: () => Promise<OnboardingRequest[]>;
  approveOnboarding: (id: string) => Promise<{ clientId: string; setupUrl: string }>;
  rejectOnboarding: (id: string, reason: string) => Promise<unknown>;
  places: () => Promise<Place[]>;
  decidePlace: (
    id: string,
    action: "approve" | "reject" | "suspend" | "reactivate",
    reason?: string,
  ) => Promise<unknown>;
};

function useList<T>(load: () => Promise<T[]>) {
  const [data, setData] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [load]);
  useEffect(run, [run]);
  return { data, failed, reload: run };
}

function CopyLink({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => undefined);
        setDone(true);
      }}
    >
      {done ? "Copied" : "Copy link"}
    </Button>
  );
}

function AccountRow({
  request,
  client,
  onChanged,
  onApproved,
}: {
  request: OnboardingRequest;
  client: ApprovalsClient;
  onChanged: () => void;
  onApproved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      setLink((await client.approveOnboarding(request.id)).setupUrl);
      onApproved();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "That email already has an account. Reject this request, or ask the owner to sign in."
          : "Could not approve this request. Nothing was created; try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!reason.trim()) return setError("Say why, so the next person knows.");
    setBusy(true);
    setError(null);
    try {
      await client.rejectOnboarding(request.id, reason.trim());
      onChanged();
    } catch {
      setError("Could not reject this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <Card padding="md">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="min-w-0 flex-1 font-medium">{request.businessName}</strong>
          <span className="text-xs text-fg-muted">{ago(request.createdAt, new Date())}</span>
        </div>
        <p className="mt-2 mb-0 text-sm text-fg-muted">
          {request.ownerName} · {request.ownerEmail} · first place {request.firstLocationName} (
          {request.firstLocationTimeZone})
        </p>
        {request.note ? <p className="mt-2 mb-0 text-sm">{request.note}</p> : null}
        {error ? (
          <div className="mt-3">
            <Banner status="danger">{error}</Banner>
          </div>
        ) : null}
        {link ? (
          <div className="mt-4 flex flex-col gap-2">
            <Banner status="positive" title="Account created">
              Give this link to {request.ownerName}. It is shown once, works once and expires in 7
              days.
            </Banner>
            <p className="m-0 text-sm break-all">{link}</p>
            <div>
              <CopyLink value={link} />
            </div>
          </div>
        ) : rejecting ? (
          <div className="mt-4 flex flex-col gap-3">
            <TextareaField
              label="Reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={reject}>
                Send rejection
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <Button size="sm" loading={busy} onClick={approve}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

export function Accounts({
  client,
  onChanged = () => {},
}: {
  client: ApprovalsClient;
  onChanged?: () => void;
}) {
  const load = useCallback(
    () => client.onboardingRequests().then((r) => r.filter((x) => x.status === "open")),
    [client],
  );
  const { data, failed, reload } = useList(load);
  return (
    <div className="flex flex-col gap-3">
      {failed ? <ErrorState title="Could not load requests" onRetry={reload} /> : null}
      {data === null && !failed ? <Skeleton className="h-24 w-full" /> : null}
      {data?.length === 0 ? (
        <EmptyState title="No accounts waiting">
          New requests from the access form show up here.
        </EmptyState>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Account requests">
        {data?.map((r) => (
          <AccountRow
            key={r.id}
            request={r}
            client={client}
            onApproved={onChanged}
            onChanged={() => {
              reload();
              onChanged();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function PlaceRow({
  place,
  client,
  onChanged,
  canManage = true,
}: {
  place: Place;
  client: ApprovalsClient;
  onChanged: () => void;
  canManage?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const s = PLACE_STATUS[place.status];

  async function act(action: "approve" | "reject" | "suspend" | "reactivate", why?: string) {
    setBusy(true);
    setError(null);
    try {
      await client.decidePlace(place.id, action, why);
      onChanged();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "This place already changed. Reload to see where it stands."
          : "Could not update this place. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function reject() {
    if (!reason.trim()) return setError("Say why, so the owner knows.");
    void act("reject", reason.trim());
  }

  return (
    <li>
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 text-sm">
            <strong className="font-medium">{place.name}</strong>
            <span className="text-fg-muted"> · {place.clientName}</span>
          </span>
          <Badge variant="quiet">{s.word}</Badge>
          {canManage && place.status === "pending" && !rejecting ? (
            <>
              <Button size="sm" loading={busy} onClick={() => act("approve")}>
                Approve place
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                Reject place
              </Button>
            </>
          ) : null}
          {canManage && place.status === "active" ? (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost" loading={busy}>
                  Pause
                </Button>
              }
              title="Pause this place?"
              description="Guests cannot answer for it and review requests waiting to be sent for this place are cancelled. Resuming does not bring them back."
              confirmLabel="Pause place"
              onConfirm={() => act("suspend")}
            />
          ) : null}
          {canManage && place.status === "suspended" ? (
            <Button size="sm" variant="outline" loading={busy} onClick={() => act("reactivate")}>
              Resume
            </Button>
          ) : null}
        </div>
        {rejecting ? (
          <div className="mt-3 flex flex-col gap-3">
            <TextareaField
              label="Reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={busy} onClick={reject}>
                Send rejection
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <Banner status="danger">{error}</Banner>
          </div>
        ) : null}
      </Card>
    </li>
  );
}

export function Locations({
  client,
  onChanged = () => {},
  canManage = true,
}: {
  client: ApprovalsClient;
  onChanged?: () => void;
  canManage?: boolean;
}) {
  const { data, failed, reload } = useList(client.places);
  const waiting = (data ?? []).filter((p) => p.status === "pending");
  const rest = (data ?? []).filter((p) => p.status === "active" || p.status === "suspended");
  return (
    <div className="flex flex-col gap-4">
      {failed ? <ErrorState title="Could not load places" onRetry={reload} /> : null}
      {data === null && !failed ? <Skeleton className="h-24 w-full" /> : null}
      <h2 className="m-0 text-xl font-normal">Waiting for approval</h2>
      {data && waiting.length === 0 ? (
        <EmptyState title="Nothing waiting">
          New places asked for by owners show up here.
        </EmptyState>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Places waiting">
        {waiting.map((p) => (
          <PlaceRow
            key={p.id}
            place={p}
            client={client}
            canManage={canManage}
            onChanged={() => {
              reload();
              onChanged();
            }}
          />
        ))}
      </ul>
      {rest.length > 0 ? <h2 className="m-0 text-xl font-normal">Running places</h2> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Running places">
        {rest.map((p) => (
          <PlaceRow
            key={p.id}
            place={p}
            client={client}
            canManage={canManage}
            onChanged={() => {
              reload();
              onChanged();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

export function AccountsApprovalsPage() {
  const me = useMe();
  const { refreshApprovals } = useFrame();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Accounts"
        description="Businesses asking for access. Approving one creates the account and gives you a link for the owner to set a password."
      />
      {me.canManageLocations ? (
        <Accounts client={api} onChanged={refreshApprovals} />
      ) : (
        <NotAvailable>Accounts are approved by account managers and admins.</NotAvailable>
      )}
    </div>
  );
}

export function PlacesApprovalsPage() {
  const me = useMe();
  const { refreshApprovals } = useFrame();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Places"
        description="New places that owners asked for. A place collects answers only once it is approved."
      />
      {me.canManageLocations ? (
        <Locations client={api} onChanged={refreshApprovals} />
      ) : (
        <NotAvailable>Places are approved by account managers and admins.</NotAvailable>
      )}
    </div>
  );
}

export function ClientPlacesPage() {
  const me = useMe();
  const { refreshApprovals } = useFrame();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Places"
        description="Every place across your clients and where it stands."
      />
      <Locations client={api} onChanged={refreshApprovals} canManage={me.canManageLocations} />
    </div>
  );
}
