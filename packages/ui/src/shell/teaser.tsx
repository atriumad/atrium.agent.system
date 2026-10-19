"use client";

import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../data/card";
import { EmptyState } from "../feedback/states";
import { PageHeader } from "../layout/layout";
import { useMe } from "./me-context";
import { type Level, teaserFor } from "./nav";

/** A module's page. A locked one says it is not in the plan; an open one that is not built yet says so. */
export function ModulePage({ feature }: { feature: string }) {
  const me = useMe();
  const [level, setLevel] = useState<Level | undefined>(undefined);
  const [ready, setReady] = useState(me.kind !== "client");

  useEffect(() => {
    if (me.kind !== "client") return;
    api
      .access()
      .then((a) => setLevel(a[feature] as Level | undefined))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [me.kind, feature]);

  const teaser = teaserFor(feature, level);
  if (!teaser) {
    return <EmptyState title="No such module">Check the menu for what is available.</EmptyState>;
  }
  if (!ready) return null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title={teaser.title}
        description={teaser.locked ? "Not in your plan yet." : "Coming soon."}
      />
      <Card padding="md" className="max-w-3xl">
        <div className="flex items-start gap-3">
          {teaser.locked ? (
            <Lock size={20} strokeWidth={1.5} aria-hidden className="mt-0.5" />
          ) : null}
          <p className="m-0 max-w-prose">{teaser.body}</p>
        </div>
      </Card>
    </div>
  );
}
