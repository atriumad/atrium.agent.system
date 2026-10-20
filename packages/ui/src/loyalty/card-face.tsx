import { Emphasis } from "../brand/emphasis";
import { Highlight } from "../brand/highlight";
import { Card } from "../data/card";
import type { LoyaltyAccent } from "./accent";
import { type CardCopy, fill } from "./copy";
import { StampGrid } from "./stamp-grid";

/** The `CardView` the qr-card app polls from the API. */
export type LoyaltyCardView = {
  state: "active" | "paused" | "closed";
  locationName: string;
  programName: string;
  rewardLabel: string;
  accent: LoyaltyAccent;
  stampsRequired: number;
  stampsInCycle: number;
  rewardReady: boolean;
  shortCode: string;
  etag: string;
};

export type LoyaltyCardFaceProps = {
  view: LoyaltyCardView;
  copy: CardCopy;
  animateIndex?: number | null | undefined;
};

/** The venue, the stamp grid, the progress line and the reward. The staff preview reuses it. */
export function LoyaltyCardFace({ view, copy, animateIndex }: LoyaltyCardFaceProps) {
  const total = view.stampsRequired;
  const filled = view.rewardReady ? total : Math.min(view.stampsInCycle, total);
  const left = Math.max(0, total - filled);
  const progress = fill(copy.progress, { n: filled, total });
  return (
    <section className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-serif text-[32px] leading-[1.05] text-balance break-words">
          {view.locationName}
        </h1>
        <p className="label-caps mt-2 mb-0 text-fg-muted">{view.programName}</p>
      </header>
      <Card tone="ruled" padding="sm">
        <StampGrid
          required={total}
          filled={filled}
          accent={view.accent}
          animateIndex={animateIndex}
          label={progress}
        />
      </Card>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-lg">
          <ProgressLine template={copy.progress} n={filled} total={total} />
        </p>
        <p className="m-0 text-sm text-fg-muted">
          {fill(copy.reward, { reward: view.rewardLabel })}
        </p>
        {view.rewardReady ? null : (
          <p className="m-0 text-sm">{left === 1 ? copy.toGoOne : fill(copy.toGo, { k: left })}</p>
        )}
      </div>
      {view.rewardReady ? (
        <Highlight className="block rounded-sm bg-size-[100%_100%]! px-4 py-4">
          <span className="block font-serif text-2xl">{copy.readyTitle}</span>
          <span className="mt-1 block text-sm">
            {fill(copy.readyBody, { reward: view.rewardLabel })}
          </span>
        </Highlight>
      ) : null}
    </section>
  );
}

/** Figures in the serif, the unit words in italic: "3 of 8 stamps" / "3 de 8 sellos". */
function ProgressLine({ template, n, total }: { template: string; n: number; total: number }) {
  return (
    <>
      {template.split(/(\{n\}|\{total\})/).map((part, index) => {
        const key = `${index}:${part}`;
        if (part === "{n}" || part === "{total}") {
          return (
            <span key={key} className="font-serif text-3xl tabular-nums">
              {part === "{n}" ? n : total}
            </span>
          );
        }
        return part.trim() ? <Emphasis key={key}>{part.trim()}</Emphasis> : " ";
      })}
    </>
  );
}
