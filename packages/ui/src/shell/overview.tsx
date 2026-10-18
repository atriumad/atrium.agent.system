"use client";

import { type Surface } from "../cases-app";
import { AgencyOverview } from "./overview-agency";
import { OwnerOverview } from "./overview-owner";

/** Where a person lands: the owner's figures for a client, the agency's queue and portfolio for the manager. */
export function OverviewPage({ surface }: { surface: Surface }) {
  return surface === "platform" ? <OwnerOverview /> : <AgencyOverview />;
}
