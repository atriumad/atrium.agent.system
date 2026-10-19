import {
  can,
  listAllPendingApprovals,
  listLocationLabels,
  listOnboardingRequests,
  type Scope,
  type Tx,
  withScope,
} from "@atrium/core";
import {
  agencyInsights,
  casesBand,
  ownerInsights,
  parseRange,
  type Range,
  responsesBand,
} from "@atrium/reputation";
import type { Context, Hono } from "hono";
import type { AppDeps } from "./app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUEUE_LIMIT = 8;

type Env = { Variables: { scope: Scope; userName: string } };

export type QueueItem = {
  kind: "case" | "approval" | "account" | "place";
  id: string;
  client: string;
  place: string | null;
  detail: string;
  severity: string | null;
  dueAt: string | null;
  overdue: boolean;
  href: string;
};

/**
 * The Overview numbers of the owner and of the agency. Row-level security decides which places,
 * clients and rows a session can see: the route only checks the kind of role, and an id outside
 * the person's scope simply finds nothing.
 */
export function mountInsights(api: Hono<Env>, deps: AppDeps) {
  const query = (raw: { range: string | undefined; id: string | undefined }) => {
    const range = parseRange(raw.range);
    if (!range) return { error: "invalid_range" as const };
    if (raw.id !== undefined && !UUID.test(raw.id)) return { error: "invalid_id" as const };
    return { range };
  };

  api.get("/insights/owner", async (c) => {
    const scope = c.get("scope");
    if (scope.kind !== "client") return c.json({ error: "forbidden" }, 403);
    const place = c.req.query("place");
    const q = query({ range: c.req.query("range"), id: place });
    if ("error" in q) return c.json({ error: q.error }, 422);
    const now = deps.now?.() ?? new Date();
    const found = await withScope(deps.db, scope, (tx) =>
      ownerInsights(tx, { range: q.range, locationId: place, now }),
    );
    return c.json(found);
  });

  // The bands above the Cases and Responses tables: every role reads them, and row-level security
  // shapes the rows, so there is no role check here. A place outside the session finds nothing.
  const band =
    <T>(
      run: (
        tx: Tx,
        input: { range: Range; locationId: string | undefined; now: Date },
      ) => Promise<T>,
    ) =>
    async (c: Context<Env>) => {
      const place = c.req.query("place");
      const q = query({ range: c.req.query("range"), id: place });
      if ("error" in q) return c.json({ error: q.error }, 422);
      const now = deps.now?.() ?? new Date();
      const found = await withScope(deps.db, c.get("scope"), (tx) =>
        run(tx, { range: q.range, locationId: place, now }),
      );
      return c.json(found);
    };
  api.get("/insights/responses", band(responsesBand));
  api.get("/insights/cases", band(casesBand));

  api.get("/insights/agency", async (c) => {
    const scope = c.get("scope");
    if (scope.kind !== "agency" && scope.kind !== "assigned") {
      return c.json({ error: "forbidden" }, 403);
    }
    const client = c.req.query("client");
    const q = query({ range: c.req.query("range"), id: client });
    if ("error" in q) return c.json({ error: q.error }, 422);
    const now = deps.now?.() ?? new Date();
    const found = await withScope(deps.db, scope, async (tx) => {
      const insights = await agencyInsights(tx, { range: q.range, clientId: client, now });
      const labels = await listLocationLabels(tx);

      const cases: QueueItem[] = insights.cases.map((k) => ({
        kind: "case",
        id: k.id,
        client: k.clientName,
        place: k.locationName,
        detail: k.summary,
        severity: k.severity,
        dueAt: k.dueAt,
        overdue: k.overdue,
        href: `/reputation/cases/${k.id}`,
      }));

      // Every approval links to /approvals/places: it is the only approvals target the Manager has for them today.
      const approvals: QueueItem[] = (await listAllPendingApprovals(tx, { clientId: client })).map(
        (a) => ({
          kind: "approval",
          id: a.id,
          client: a.clientName,
          place: a.locationName,
          detail: a.summary,
          severity: null,
          dueAt: null,
          overdue: false,
          href: "/approvals/places",
        }),
      );

      // Account requests belong to no client yet, so a client filter leaves them out.
      const accounts: QueueItem[] =
        client === undefined && can(scope.role, "location", "manage")
          ? (await listOnboardingRequests(tx, scope))
              .filter((r) => r.status === "open")
              .map((r) => ({
                kind: "account",
                id: r.id,
                client: r.businessName,
                place: r.firstLocationName,
                detail: "Asked to join",
                severity: null,
                dueAt: null,
                overdue: false,
                href: "/approvals/accounts",
              }))
          : [];

      const places: QueueItem[] = labels
        .filter((l) => l.status === "pending" && (client === undefined || l.clientId === client))
        .map((l) => ({
          kind: "place",
          id: l.id,
          client: l.clientName,
          place: l.locationName,
          detail: "Waiting for approval",
          severity: null,
          dueAt: null,
          overdue: false,
          href: "/approvals/places",
        }));

      return {
        ...insights,
        queue: [...cases, ...approvals, ...accounts, ...places].slice(0, QUEUE_LIMIT),
        queueCounts: {
          cases: insights.needingCases,
          approvals: approvals.length,
          accounts: accounts.length,
          places: places.length,
        },
      };
    });
    return c.json(found);
  });
}
