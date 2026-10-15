import type { AgentsClient } from "@atrium/contracts";
import {
  type ConsumerDefinition,
  defineConsumer,
  featureGate,
  type JobDefinition,
} from "@atrium/core";

const reputationOnly = { isEnabled: featureGate("reputation") };

/**
 * What Host's subagents react to. Each handler only asks the agents service for a task: the
 * deciding, the model and the effects live there. A refusal comes back as a value and nothing
 * retries it; a service that is down throws, so the queue retries the event.
 */
export function agentConsumers(agents: AgentsClient): {
  consumers: ConsumerDefinition[];
  jobs: JobDefinition[];
} {
  const consumers: ConsumerDefinition[] = [
    defineConsumer({
      name: "host.ask.schedule",
      event: "visit.identified",
      options: reputationOnly,
      handler: async (event) => {
        if (!event.locationId) return;
        await agents.call("ask.schedule", {
          clientId: event.clientId,
          locationId: event.locationId,
          input: { guestId: event.data.guestId, visitDate: event.data.date },
        });
      },
    }) as ConsumerDefinition,
    defineConsumer({
      name: "host.recovery.read",
      event: "survey.response.submitted",
      options: reputationOnly,
      handler: async (event) => {
        await agents.call("recovery.evaluate", {
          clientId: event.clientId,
          locationId: event.locationId,
          input: {
            trigger: "submitted",
            responseId: event.data.responseId,
            rating: event.data.rating,
          },
        });
      },
    }) as ConsumerDefinition,
    // The agent read the guest's words: a serious reading can open a case the rating did not.
    defineConsumer({
      name: "host.recovery.read_sentiment",
      event: "survey.response.read",
      options: reputationOnly,
      handler: async (event) => {
        await agents.call("recovery.evaluate", {
          clientId: event.clientId,
          locationId: event.locationId,
          input: {
            trigger: "read",
            responseId: event.data.responseId,
            concern: event.data.concern,
            safety: event.data.safety,
          },
        });
      },
    }) as ConsumerDefinition,
    defineConsumer({
      name: "host.sentiment.read",
      event: "survey.response.submitted",
      options: reputationOnly,
      handler: async (event) => {
        await agents.call("sentiment.read", {
          clientId: event.clientId,
          locationId: event.locationId,
          input: { responseId: event.data.responseId, rating: event.data.rating },
        });
      },
    }) as ConsumerDefinition,
  ];

  const jobs: JobDefinition[] = [
    {
      name: "host.ask.send_due",
      cron: "* * * * *",
      run: async () => {
        await agents.call("ask.send_due", { input: {} });
      },
    },
  ];
  return { consumers, jobs };
}
