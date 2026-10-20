import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "../actions/button";
import { Wordmark } from "../brand/wordmark";
import { Card } from "../data/card";
import { Skeleton } from "../data/misc";
import { Banner } from "../feedback/banner";
import { LoyaltyCardFace, type LoyaltyCardView } from "./card-face";
import type { CardCopy } from "./copy";
import { EmailOptIn, type EmailOptInProps } from "./email-opt-in";

/** A plain centred state card: every state that is not a card (paused, not found, offline join...). */
export function JoinStateScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <Wordmark size="sm" />
      <Card tone="ruled" padding="md">
        <h1 className="m-0 font-serif text-3xl leading-tight">{title}</h1>
        <p className="mt-3 mb-0 text-fg-body">{body}</p>
      </Card>
    </main>
  );
}

export type LoyaltyCardScreenProps = {
  status: "loading" | "live" | "offline" | "not_found" | "rate_limited";
  view: LoyaltyCardView | null;
  copy: CardCopy;
  onEmail: EmailOptInProps["onSubmit"];
  emailDone: boolean;
  showHint: boolean;
  onDismissHint: () => void;
  announce?: string | null | undefined;
  animateIndex?: number | null | undefined;
};

/** The guest's screen: the card, the code and its QR, the home-screen hint, the optional email box. */
export function LoyaltyCardScreen({
  status,
  view,
  copy,
  onEmail,
  emailDone,
  showHint,
  onDismissHint,
  announce,
  animateIndex,
}: LoyaltyCardScreenProps) {
  // Keeps polite announcements mounted so a change is read out.
  const live = (
    <div role="status" aria-live="polite" className="sr-only">
      {announce ?? ""}
    </div>
  );

  if (!view) {
    if (status === "loading") {
      return (
        <main
          aria-busy="true"
          className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-5 px-4 py-8"
        >
          <p className="m-0 text-sm text-fg-muted">{copy.loading}</p>
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-10 w-1/2" />
          {live}
        </main>
      );
    }
    if (status === "rate_limited") {
      return <JoinStateScreen title={copy.limitedTitle} body={copy.limitedBody} />;
    }
    if (status === "offline") {
      return <JoinStateScreen title={copy.offlineTitle} body={copy.offlineBody} />;
    }
    return <JoinStateScreen title={copy.notFoundTitle} body={copy.notFoundBody} />;
  }

  if (view.state === "paused") {
    return <JoinStateScreen title={copy.pausedTitle} body={copy.pausedBody} />;
  }
  if (view.state === "closed") {
    return <JoinStateScreen title={copy.closedTitle} body={copy.closedBody} />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-6 px-4 py-8">
      {status === "offline" ? <Banner status="warning">{copy.offline}</Banner> : null}
      {status === "rate_limited" ? <Banner status="warning">{copy.limitedBody}</Banner> : null}
      <LoyaltyCardFace view={view} copy={copy} animateIndex={animateIndex} />
      <section className="flex items-center justify-between gap-4 border-t border-charcoal-800 pt-5 dark:border-cream-300">
        <div className="min-w-0">
          <p className="label-caps m-0 text-fg-muted">{copy.codeLabel}</p>
          <p className="mt-1 mb-2 font-serif text-[40px] leading-none tabular-nums tracking-wider">
            {view.shortCode}
          </p>
          <p className="m-0 text-sm text-fg-muted">{copy.codeHint}</p>
        </div>
        {/* The code, never the card token: the token is a bearer secret. */}
        <div
          className="shrink-0 rounded-card bg-cream-100 p-3 text-charcoal-900"
          data-card-qr-box=""
        >
          <QRCodeSVG
            data-card-qr=""
            value={view.shortCode}
            size={120}
            fgColor="currentColor"
            bgColor="transparent"
          />
        </div>
      </section>
      {showHint ? (
        <div className="flex items-start gap-3 rounded-card border border-dashed border-charcoal-800 p-3 text-sm dark:border-cream-300">
          <p className="m-0 flex-1">{copy.hint}</p>
          <Button
            variant="outline"
            size="sm"
            icon={<X size={14} aria-hidden="true" />}
            onClick={onDismissHint}
          >
            {copy.hintDismiss}
          </Button>
        </div>
      ) : null}
      <EmailOptIn venue={view.locationName} copy={copy} onSubmit={onEmail} done={emailDone} />
      {live}
    </main>
  );
}
