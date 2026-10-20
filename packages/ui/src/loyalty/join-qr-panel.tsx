"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonStyles } from "../actions/button";
import { api } from "../api";
import { Card } from "../data/card";
import { Skeleton } from "../data/misc";
import { Banner } from "../feedback/banner";
import { ConfirmDialog } from "../feedback/overlays";

export type JoinQrPanelProps = { locationId: string; onRotated?: () => void };

type Link = { status: "loading" } | { status: "error" } | { status: "ready"; url: string | null };

export function printHref(locationId: string, format: "poster" | "cards"): string {
  return `/print/loyalty?${new URLSearchParams({ locationId, format })}`;
}

/** The QR a guest scans to join (it encodes only the join link), and the ways to print or replace it. */
export function JoinQrPanel({ locationId, onRotated }: JoinQrPanelProps) {
  const [link, setLink] = useState<Link>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    return api
      .loyaltyJoinLink(locationId)
      .then((r) => setLink({ status: "ready", url: r.url }))
      .catch(() => setLink({ status: "error" }));
  }, [locationId]);

  useEffect(() => {
    setLink({ status: "loading" });
    setCopied(false);
    void load();
  }, [load]);

  async function rotate() {
    setFailed(false);
    try {
      await api.rotateLoyaltyQr(locationId);
      await load();
      setCopied(false);
      onRotated?.();
    } catch {
      setFailed(true);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const url = link.status === "ready" ? link.url : null;
  return (
    <Card padding="md" title="Join QR" description="Guests scan it to get their card.">
      <div className="mt-4 flex flex-col gap-4">
        {link.status === "loading" ? <Skeleton className="size-40" /> : null}
        {link.status === "error" ? (
          <Banner status="danger">We could not load the join link.</Banner>
        ) : null}
        {link.status === "ready" && link.url === null ? (
          <Banner status="warning">QR_CARD_URL is not set on the server.</Banner>
        ) : null}
        {url ? (
          <div className="w-fit rounded-sm border border-charcoal-800 bg-cream-100 p-3">
            <QRCodeSVG value={url} size={160} marginSize={0} title="Join QR" />
          </div>
        ) : null}
        {failed ? <Banner status="danger">We could not rotate the QR. Try again.</Banner> : null}
        <div className="flex flex-wrap gap-2">
          {url ? (
            <Button variant="outline" size="sm" onClick={() => copy(url)}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
          ) : null}
          <a
            className={buttonStyles({ variant: "outline", size: "sm" })}
            href={printHref(locationId, "poster")}
            target="_blank"
            rel="noreferrer"
          >
            Print poster
          </a>
          <a
            className={buttonStyles({ variant: "outline", size: "sm" })}
            href={printHref(locationId, "cards")}
            target="_blank"
            rel="noreferrer"
          >
            Print table cards
          </a>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                Rotate QR
              </Button>
            }
            title="Rotate the join QR?"
            description="Every printed join QR stops working. Cards already issued keep working."
            confirmLabel="Rotate QR"
            onConfirm={rotate}
          />
        </div>
      </div>
    </Card>
  );
}
