import {
  type ConsumerDefinition,
  type Database,
  defineConsumer,
  featureGate,
  isAgentActive,
  type JobDefinition,
  withAgency,
  withTenant,
} from "@atrium/core";
import type { Gateway } from "@atrium/policy";
import {
  listDueReviewRequests,
  scheduleReviewRequest,
  skipReviewRequest,
} from "../application/requests";

export const ASK = "host.ask";

/**
 * Ask. Docs: agents / Host. Triggered by an identified visit; delivers a review request to every
 * guest who agreed to be contacted, at the happy moment. The deciding is deterministic: no model.
 * It acts only through the gateway, so the kill switch, the package, the daily limit and the
 * audit log apply to every send.
 */
export function askAgent(gateway: Gateway, db: Database, clock: () => Date = () => new Date()) {
  const consumers: ConsumerDefinition[] = [
    defineConsumer({
      name: "host.ask.schedule",
      event: "visit.identified",
      options: { isEnabled: featureGate("reputation") },
      handler: async (event, tx) => {
        if (!event.locationId) return;
        // When Ask is off for a client nothing is queued, so switching it back on does not
        // release a backlog of requests for visits that are long past.
        if (!(await isAgentActive(tx, ASK, event.clientId))) return;
        await scheduleReviewRequest(
          tx,
          {
            clientId: event.clientId,
            locationId: event.locationId,
            guestId: event.data.guestId,
            visitDate: event.data.date,
          },
          { now: clock },
        );
      },
    }) as ConsumerDefinition,
  ];

  const jobs: JobDefinition[] = [
    {
      name: "host.ask.send_due",
      cron: "* * * * *",
      run: async () => {
        const due = await withAgency(db, (tx) => listDueReviewRequests(tx, clock()));
        for (const request of due) {
          const result = await gateway.call({
            agentId: ASK,
            clientId: request.clientId,
            locationId: request.locationId,
            tool: "reputation.send_review_request",
            input: {
              requestId: request.id,
              reason: "the scheduled time for this request has come",
            },
          });
          if (result.decision !== "rejected") continue;
          // A daily limit (step 4) only delays it. Anything else will not change on its own, so
          // the request is dropped instead of retrying every minute.
          if (result.step === 4) continue;
          const reason = result.step === 1 || result.step === 2 ? "agent_unavailable" : "policy";
          await withTenant(db, request.clientId, (tx) => skipReviewRequest(tx, request.id, reason));
        }
      },
    },
  ];
  return { consumers, jobs };
}
