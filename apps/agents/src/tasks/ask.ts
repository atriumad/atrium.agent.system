import { isAgentActive, withAgency, withTenant } from "@atrium/core";
import {
  listDueReviewRequests,
  scheduleReviewRequest,
  skipReviewRequest,
} from "@atrium/reputation";
import { defineTask } from "./task";

export const ASK = "host.ask";

/**
 * How long `ask.send_due` keeps starting sends. The client gives up at 30 s, so the loop stops
 * well before that and leaves the rest for the next tick instead of overlapping with it.
 */
export const SEND_DUE_BUDGET_MS = 20_000;

/** True once the budget is spent: no new send may start. */
export function budgetSpent(started: Date, now: Date, budgetMs = SEND_DUE_BUDGET_MS): boolean {
  return now.getTime() - started.getTime() >= budgetMs;
}

/**
 * Ask. Docs: agents / Host. Triggered by an identified visit; delivers a review request to every
 * guest who agreed to be contacted, at the happy moment. The deciding is deterministic: no model.
 * Sending goes through the gateway, so the kill switch, the package, the daily limit and the audit
 * log apply to every send.
 */
export const askSchedule = defineTask({
  name: "ask.schedule",
  run: (ctx, { clientId, locationId, input }) =>
    withTenant(ctx.db, clientId, async (tx) => {
      // When Ask is off for a client nothing is queued, so switching it back on does not release a
      // backlog of requests for visits that are long past.
      if (!(await isAgentActive(tx, ASK, clientId))) {
        return { decision: "rejected", reason: "ask is switched off for this client" } as const;
      }
      const outcome = await scheduleReviewRequest(
        tx,
        { clientId, locationId, guestId: input.guestId, visitDate: input.visitDate },
        { now: ctx.now },
      );
      return { decision: "executed", result: { status: outcome.status } } as const;
    }),
});

export const askSendDue = defineTask({
  name: "ask.send_due",
  run: async (ctx) => {
    const started = ctx.now();
    const due = await withAgency(ctx.db, (tx) => listDueReviewRequests(tx, ctx.now()));
    let sent = 0;
    let deferred = 0;
    let dropped = 0;
    for (const request of due) {
      if (budgetSpent(started, ctx.now())) break;
      const result = await ctx.gateway.call({
        agentId: ASK,
        clientId: request.clientId,
        locationId: request.locationId,
        tool: "reputation.send_review_request",
        input: {
          requestId: request.id,
          reason: "the scheduled time for this request has come",
        },
      });
      if (result.decision === "executed") {
        // Only a request this call actually sent counts; one already handled by another call, or
        // skipped by the tool, does not.
        const outcome = (result.output as { outcome?: string } | null)?.outcome;
        if (outcome === "sent") sent++;
        continue;
      }
      if (result.decision !== "rejected") continue;
      // A daily limit (step 4) only delays it. Anything else will not change on its own, so the
      // request is dropped instead of retrying every minute.
      if (result.step === 4) {
        deferred++;
        continue;
      }
      const reason = result.step === 1 || result.step === 2 ? "agent_unavailable" : "policy";
      await withTenant(ctx.db, request.clientId, (tx) => skipReviewRequest(tx, request.id, reason));
      dropped++;
    }
    return { decision: "executed", result: { sent, deferred, dropped } };
  },
});
