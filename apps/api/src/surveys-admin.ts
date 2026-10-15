import { HelpCloseInput, HelpMessageInput, HelpRequestInput } from "@atrium/contracts";
import { can, describeLocations, listLocationLabels, type Scope, withScope } from "@atrium/core";
import {
  closeRequest,
  createManualInvitation,
  createSurveyRequest,
  getThread,
  HelpAttachmentError,
  listPickableResponses,
  listSurveyForms,
  listSurveyRequests,
  listSurveyResponses,
  postMessage,
  rotateQr,
  SurveyForbiddenError,
  SurveyNotFoundError,
  SurveyStateError,
  updateLocationSettings,
} from "@atrium/reputation";
import type { Hono } from "hono";
import type { AppDeps } from "./app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = { Variables: { scope: Scope; userName: string } };

export type SurveyAdminConfig = {
  /** Signs the printable QR links. Without it forms have no QR. */
  qrSecret?: string | undefined;
  /** Where guests open surveys: the Hub's public origin. */
  hubUrl: string;
};

/**
 * Survey administration, on the session-authenticated API. Reading responses, building forms and
 * links, and closing requests belong to the agency (agency admin, account manager; staff read).
 * A client owner can ask for help (`POST /surveys/requests`) and take part in the conversation
 * (read it, reply, mark it solved).
 * The role check lives in the use cases; these routes only translate errors.
 */
export function mountSurveyAdmin(api: Hono<Env>, deps: AppDeps, config: SurveyAdminConfig) {
  const options = {
    ...(deps.now ? { now: deps.now } : {}),
    ...(deps.publish ? { publish: deps.publish } : {}),
    ...(deps.transport ? { transport: deps.transport } : {}),
  };

  const guard = async <T>(
    c: { json: (b: unknown, s?: any) => Response },
    run: () => Promise<T>,
  ) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof SurveyForbiddenError) return c.json({ error: "forbidden" }, 403);
      if (error instanceof HelpAttachmentError) {
        return c.json({ error: "attachment_not_found" }, 422);
      }
      if (error instanceof SurveyNotFoundError) return c.json({ error: "not_found" }, 404);
      if (error instanceof SurveyStateError) {
        return c.json({ error: "invalid_state", message: error.message }, 409);
      }
      if (error instanceof Error && /^the (review|request)/.test(error.message)) {
        return c.json({ error: "invalid_request", message: error.message }, 422);
      }
      throw error;
    }
  };

  // The places a person can pick from: an agency user to manage, a client owner to ask about.
  api.get("/surveys/locations", async (c) => {
    const role = c.get("scope").role;
    if (!can(role, "survey", "forms") && !can(role, "survey", "request")) {
      return c.json({ error: "forbidden" }, 403);
    }
    const locations = await withScope(deps.db, c.get("scope"), (tx) => listLocationLabels(tx));
    return c.json({ locations });
  });

  // Registered before any parametrised /surveys/responses/... route.
  api.get("/surveys/responses/pickable", (c) =>
    guard(c, async () => {
      const filter: { locationId?: string; requestId?: string; id?: string } = {};
      for (const key of ["locationId", "requestId", "id"] as const) {
        const value = c.req.query(key);
        if (value === undefined) continue;
        if (!UUID.test(value)) return c.json({ error: "invalid_request" }, 422);
        filter[key] = value;
      }
      const responses = await withScope(deps.db, c.get("scope"), (tx) =>
        listPickableResponses(tx, c.get("scope"), filter),
      );
      return c.json({ responses });
    }),
  );

  api.get("/surveys/responses", (c) =>
    guard(c, async () => {
      const locationId = c.req.query("locationId");
      const max = Number(c.req.query("maxRating") ?? 0);
      if (locationId !== undefined && !UUID.test(locationId)) {
        return c.json({ error: "invalid_request" }, 422);
      }
      const responses = await withScope(deps.db, c.get("scope"), (tx) =>
        listSurveyResponses(tx, c.get("scope"), {
          ...(locationId ? { locationId } : {}),
          ...(max >= 1 && max <= 5 ? { maxRating: max } : {}),
        }),
      );
      return c.json({ responses });
    }),
  );

  api.get("/surveys/forms", (c) =>
    guard(c, async () => {
      const forms = await withScope(deps.db, c.get("scope"), (tx) =>
        listSurveyForms(tx, c.get("scope"), config.qrSecret),
      );
      return c.json({
        forms: forms.map((f) => ({ ...f, qrUrl: f.qrPath ? `${config.hubUrl}${f.qrPath}` : null })),
      });
    }),
  );

  api.post("/surveys/forms/:locationId/link", (c) =>
    guard(c, async () => {
      const locationId = c.req.param("locationId");
      if (!UUID.test(locationId)) return c.json({ error: "not_found" }, 404);
      const made = await withScope(deps.db, c.get("scope"), (tx) =>
        createManualInvitation(tx, c.get("scope"), locationId, options),
      );
      return c.json({ url: `${config.hubUrl}/s/${made.token}`, expiresAt: made.expiresAt });
    }),
  );

  api.put("/surveys/forms/:locationId/settings", (c) =>
    guard(c, async () => {
      const scope = c.get("scope");
      const locationId = c.req.param("locationId");
      if (!UUID.test(locationId)) return c.json({ error: "not_found" }, 404);
      const body = (await c.req.json().catch(() => null)) as {
        reviewUrl?: unknown;
        requestDelayMinutes?: unknown;
      } | null;
      const reviewUrl = body?.reviewUrl;
      const delay = body?.requestDelayMinutes;
      if (
        (reviewUrl !== undefined && reviewUrl !== null && typeof reviewUrl !== "string") ||
        (delay !== undefined && typeof delay !== "number")
      ) {
        return c.json({ error: "invalid_request" }, 422);
      }
      // The review link needs `manage`, the delay `operate`; a mixed request is refused whole.
      if (reviewUrl !== undefined && !can(scope.role, "survey", "manage")) {
        return c.json({ error: "forbidden" }, 403);
      }
      if (delay !== undefined && !can(scope.role, "survey", "operate")) {
        return c.json({ error: "forbidden" }, 403);
      }
      if (reviewUrl === undefined && delay === undefined) {
        return c.json({ error: "invalid_request" }, 422);
      }
      const settings = await withScope(deps.db, scope, async (tx) => {
        const label = (await describeLocations(tx, [locationId])).get(locationId);
        if (!label) throw new SurveyNotFoundError("location not found");
        return updateLocationSettings(
          tx,
          label.clientId,
          locationId,
          {
            ...(reviewUrl !== undefined ? { reviewUrl: reviewUrl === "" ? null : reviewUrl } : {}),
            ...(delay !== undefined ? { requestDelayMinutes: delay } : {}),
          },
          { type: "user", id: scope.userId },
        );
      });
      return c.json({ settings });
    }),
  );

  api.post("/surveys/forms/:locationId/rotate-qr", (c) =>
    guard(c, async () => {
      const scope = c.get("scope");
      const locationId = c.req.param("locationId");
      if (!UUID.test(locationId)) return c.json({ error: "not_found" }, 404);
      if (!can(scope.role, "survey", "manage")) return c.json({ error: "forbidden" }, 403);
      const qrVersion = await withScope(deps.db, scope, async (tx) => {
        const label = (await describeLocations(tx, [locationId])).get(locationId);
        if (!label) throw new SurveyNotFoundError("location not found");
        return rotateQr(tx, label.clientId, locationId, { type: "user", id: scope.userId });
      });
      return c.json({ qrVersion });
    }),
  );

  api.get("/surveys/requests", (c) =>
    guard(c, async () => {
      const requests = await withScope(deps.db, c.get("scope"), (tx) =>
        listSurveyRequests(tx, c.get("scope")),
      );
      return c.json({ requests });
    }),
  );

  api.post("/surveys/requests", (c) =>
    guard(c, async () => {
      const parsed = HelpRequestInput.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
      const input = parsed.data;
      const id = await withScope(deps.db, c.get("scope"), (tx) =>
        createSurveyRequest(
          tx,
          c.get("scope"),
          c.get("userName"),
          {
            locationId: input.locationId,
            note: input.note,
            ...(input.attachment ? { attachment: input.attachment } : {}),
          },
          options,
        ),
      );
      return c.json({ id }, 201);
    }),
  );

  api.get("/surveys/requests/:id", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const thread = await withScope(deps.db, c.get("scope"), (tx) =>
        getThread(tx, c.get("scope"), id),
      );
      return c.json(thread);
    }),
  );

  api.post("/surveys/requests/:id/messages", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const parsed = HelpMessageInput.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
      const message = await withScope(deps.db, c.get("scope"), (tx) =>
        postMessage(
          tx,
          c.get("scope"),
          c.get("userName"),
          id,
          {
            body: parsed.data.body,
            ...(parsed.data.attachment ? { attachment: parsed.data.attachment } : {}),
          },
          options,
        ),
      );
      return c.json({ message }, 201);
    }),
  );

  api.post("/surveys/requests/:id/close", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const parsed = HelpCloseInput.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
      await withScope(deps.db, c.get("scope"), (tx) =>
        closeRequest(
          tx,
          c.get("scope"),
          c.get("userName"),
          id,
          parsed.data.to,
          parsed.data.message ?? null,
          options,
        ),
      );
      return c.json({ ok: true });
    }),
  );
}
