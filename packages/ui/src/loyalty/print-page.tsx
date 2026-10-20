"use client";

import { QRCodeSVG } from "qrcode.react";
import { Fragment, useEffect, useState } from "react";
import { Button, buttonStyles } from "../actions/button";
import { ApiError, api } from "../api";
import { Emphasis } from "../brand/emphasis";
import { Banner } from "../feedback/banner";
import { type CardLocale, fill, POSTER_COPY } from "./copy";
import { loyaltyFailure } from "./program-page";

export type LoyaltyPrintPageProps = {
  locationId: string;
  format: "poster" | "cards";
  lang: CardLocale;
};

type Sheet = {
  venue: string;
  reward: string;
  stamps: number;
  url: string | null;
};

type State =
  | { status: "loading" }
  | { status: "signin" | "locked" | "forbidden" | "missing" | "error" }
  | ({ status: "ready" } & Sheet);

const MESSAGE: Record<Exclude<State["status"], "loading" | "ready">, string> = {
  signin: "Sign in to the Platform first.",
  locked: "Not in your plan yet.",
  forbidden: "Not available for your role",
  missing: "This place has no loyalty program yet. Set it up under Program & QR.",
  error: "We could not load this sheet. Reload the page to try again.",
};

/** "{stamps} stamps: {reward}" with the figure in the serif and the unit word in italic. */
function RewardLine({
  template,
  stamps,
  reward,
}: {
  template: string;
  stamps: number;
  reward: string;
}) {
  return (
    <>
      {template.split(/(\{stamps\}|\{reward\})/).map((part, index) => {
        const key = `${index}:${part}`;
        if (part === "{stamps}") {
          return (
            <span key={key} className="font-serif tabular-nums">
              {stamps}
            </span>
          );
        }
        if (part === "{reward}") return <Fragment key={key}>{reward}</Fragment>;
        const unit = /^\s*([^\s:]+)(:?)\s*$/.exec(part);
        if (unit) {
          return (
            <Fragment key={key}>
              {" "}
              <Emphasis>{unit[1]}</Emphasis>
              {unit[2]}{" "}
            </Fragment>
          );
        }
        return <Fragment key={key}>{part}</Fragment>;
      })}
    </>
  );
}

/** The printable sheet for one place: ink on cream, outside the app frame. It names only the venue, the reward and the join QR. */
export function LoyaltyPrintPage({ locationId, format, lang }: LoyaltyPrintPageProps) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!locationId) return setState({ status: "missing" });
    let live = true;
    setState({ status: "loading" });
    Promise.allSettled([
      api.places(),
      api.loyaltyProgram(locationId),
      api.loyaltyJoinLink(locationId),
    ]).then(([places, program, link]) => {
      if (!live) return;
      const failed = [places, program, link].filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (failed.length > 0) {
        const unauthorized = failed.some(
          (r) => r.reason instanceof ApiError && r.reason.status === 401,
        );
        if (unauthorized) return setState({ status: "signin" });
        const locked = failed.find((r) => loyaltyFailure(r.reason) !== "error");
        return setState({ status: locked ? loyaltyFailure(locked.reason) : "error" });
      }
      if (
        places.status !== "fulfilled" ||
        program.status !== "fulfilled" ||
        link.status !== "fulfilled"
      )
        return;
      const place = places.value.find((p) => p.id === locationId);
      if (!place || !program.value) return setState({ status: "missing" });
      setState({
        status: "ready",
        venue: place.name,
        reward: program.value.rewardLabel,
        stamps: program.value.stampsRequired,
        url: link.value.url,
      });
    });
    return () => {
      live = false;
    };
  }, [locationId]);

  const other = (l: CardLocale) => `?${new URLSearchParams({ locationId, format, lang: l })}`;
  return (
    <main className="min-h-dvh bg-cream-100 text-charcoal-900">
      <style>{"@page { size: A4 portrait; margin: 12mm }"}</style>
      <div className="print:hidden flex flex-wrap items-center gap-2 border-b border-charcoal-800 px-6 py-3">
        <Button size="sm" onClick={() => window.print()}>
          Print
        </Button>
        {(["en", "es"] as const).map((l) => (
          <a
            key={l}
            href={other(l)}
            aria-current={l === lang ? "true" : undefined}
            className={buttonStyles({ variant: l === lang ? "ink" : "outline", size: "sm" })}
          >
            {l === "en" ? "English" : "Español"}
          </a>
        ))}
      </div>
      {state.status === "loading" ? (
        <p className="m-6" aria-busy="true">
          Loading…
        </p>
      ) : null}
      {state.status !== "loading" && state.status !== "ready" ? (
        <div className="m-6 max-w-md">
          <Banner status="neutral">{MESSAGE[state.status]}</Banner>
        </div>
      ) : null}
      {state.status === "ready" && !state.url ? (
        <div className="m-6 max-w-md">
          <Banner status="warning">QR_CARD_URL is not set on the server.</Banner>
        </div>
      ) : null}
      {state.status === "ready" && state.url ? (
        format === "poster" ? (
          <Poster sheet={state} url={state.url} lang={lang} />
        ) : (
          <Cards sheet={state} url={state.url} lang={lang} />
        )
      ) : null}
    </main>
  );
}

function Poster({ sheet, url, lang }: { sheet: Sheet; url: string; lang: CardLocale }) {
  const copy = POSTER_COPY[lang];
  return (
    <section className="mx-auto flex w-[186mm] min-h-[273mm] flex-col items-center justify-center gap-8 text-center">
      <h1 className="m-0 font-serif text-[64px] leading-[1.02] text-balance break-words">
        {sheet.venue}
      </h1>
      <p className="m-0 font-serif text-3xl text-balance">
        {fill(copy.title, { venue: sheet.venue })}
      </p>
      <div className="bg-cream-100 p-[4mm]">
        <QRCodeSVG
          value={url}
          size={340}
          style={{ width: "90mm", height: "90mm" }}
          marginSize={0}
          title="Join QR"
        />
      </div>
      <p className="m-0 text-xl">{copy.scan}</p>
      <p className="m-0 text-2xl">
        <RewardLine template={copy.reward} stamps={sheet.stamps} reward={sheet.reward} />
      </p>
    </section>
  );
}

function Cards({ sheet, url, lang }: { sheet: Sheet; url: string; lang: CardLocale }) {
  const copy = POSTER_COPY[lang];
  return (
    <section className="mx-auto grid w-[186mm] grid-cols-2 grid-rows-2">
      {[0, 1, 2, 3].map((n) => (
        <article
          key={n}
          className="flex h-[136mm] w-[93mm] flex-col items-center justify-center gap-3 border border-dashed border-charcoal-800/60 px-[6mm] text-center break-inside-avoid"
        >
          <h2 className="m-0 font-serif text-[28px] leading-[1.05] text-balance break-words">
            {sheet.venue}
          </h2>
          <p className="m-0 text-sm text-balance">{fill(copy.title, { venue: sheet.venue })}</p>
          <QRCodeSVG
            value={url}
            size={170}
            style={{ width: "45mm", height: "45mm" }}
            marginSize={0}
            title="Join QR"
          />
          <p className="m-0 text-xs text-balance">{copy.scan}</p>
          <p className="m-0 text-sm text-balance">
            <RewardLine template={copy.reward} stamps={sheet.stamps} reward={sheet.reward} />
          </p>
        </article>
      ))}
    </section>
  );
}
