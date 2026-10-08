import { desc, eq, sql } from "drizzle-orm";
import { isValidTimeZone } from "../domain/location";
import { can, type Scope } from "../domain/roles";
import type { Auth } from "../infra/auth";
import { organizations, users } from "../infra/auth-schema";
import { type Database, type Tx, withAgency } from "../infra/db";
import { clients, locations, onboardingRequests } from "../infra/schema";
import { assignClient } from "./assignments";
import { writeAudit } from "./audit";
import { createClientWithOrganization } from "./provisioning";
import type { SetupLinkCapture } from "./setup-link";

export class OnboardingForbiddenError extends Error {}
export class OnboardingNotFoundError extends Error {}
export class OnboardingStateError extends Error {}

export type OnboardingInput = {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  firstLocationName: string;
  firstLocationTimeZone: string;
  note?: string | undefined;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const within = (value: string, max: number) =>
  value.trim().length > 0 && value.trim().length <= max;

/**
 * The public "request access" form. It never creates an account and never says whether an email
 * was already known: bad input and repeats are dropped quietly, so it leaks nothing.
 */
export async function submitOnboardingRequest(db: Database, input: OnboardingInput): Promise<void> {
  const ok =
    within(input.businessName, 120) &&
    within(input.ownerName, 120) &&
    within(input.firstLocationName, 120) &&
    EMAIL.test(input.ownerEmail.trim()) &&
    input.ownerEmail.length <= 200 &&
    isValidTimeZone(input.firstLocationTimeZone) &&
    (input.note ?? "").length <= 1000;
  if (!ok) return;
  await db.execute(
    sql`select core.submit_onboarding_request(${input.businessName}, ${input.ownerName}, ${input.ownerEmail}, ${input.firstLocationName}, ${input.firstLocationTimeZone}, ${input.note ?? ""})`,
  );
}

function assertCanDecide(scope: Scope) {
  if (scope.kind === "client" || !can(scope.role, "location", "manage")) {
    throw new OnboardingForbiddenError(`role ${scope.role} cannot handle onboarding requests`);
  }
}

export async function listOnboardingRequests(tx: Tx, scope: Scope) {
  assertCanDecide(scope);
  return tx
    .select()
    .from(onboardingRequests)
    .orderBy(desc(onboardingRequests.createdAt))
    .limit(200);
}

async function loadOpen(tx: Tx, id: string) {
  const [row] = await tx.select().from(onboardingRequests).where(eq(onboardingRequests.id, id));
  if (!row) throw new OnboardingNotFoundError("request not found");
  if (row.status !== "open") throw new OnboardingStateError(`the request is already ${row.status}`);
  return row;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "client";
}

async function freeSlug(tx: Tx, base: string): Promise<string> {
  for (let n = 1; n < 200; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, candidate))
      .limit(1);
    const org = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (taken.length === 0 && org.length === 0) return candidate;
  }
  throw new Error("no free slug");
}

export type ApprovalDeps = { auth: Auth; setup: SetupLinkCapture; redirectTo: string };

/**
 * Creates the client, its organization, the owner and the first (active) location, assigns the
 * approving account manager, and returns a one-time link for the owner to set a password.
 * The auth calls and the database work cannot share one transaction, so anything created is
 * removed again if a later step fails, and the request stays open to retry.
 */
export async function approveOnboardingRequest(
  db: Database,
  scope: Scope,
  requestId: string,
  deps: ApprovalDeps,
): Promise<{ clientId: string; setupUrl: string }> {
  assertCanDecide(scope);
  const request = await withAgency(db, (tx) => loadOpen(tx, requestId));
  const email = request.ownerEmail.toLowerCase();

  const existing = await withAgency(db, (tx) =>
    tx
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email))
      .limit(1),
  );
  if (existing.length > 0) {
    throw new OnboardingStateError("an account with this email already exists");
  }

  const created: { userId?: string; clientId?: string; organizationId?: string } = {};
  try {
    const signUp = await deps.auth.api.signUpEmail({
      body: {
        email,
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        name: request.ownerName,
      },
    });
    created.userId = signUp.user.id;

    await withAgency(db, async (tx) => {
      const slug = await freeSlug(tx, slugify(request.businessName));
      const made = await createClientWithOrganization(tx, { name: request.businessName, slug });
      created.clientId = made.client.id;
      created.organizationId = made.organization.id;
      await tx.insert(locations).values({
        clientId: made.client.id,
        name: request.firstLocationName,
        timeZone: request.firstLocationTimeZone,
        status: "active",
        statusChangedAt: new Date(),
        statusChangedBy: scope.userId,
      });
      if (scope.role === "account_manager") {
        await assignClient(tx, scope.userId, made.client.id, { type: "user", id: scope.userId });
      }
    });

    await deps.auth.api.addMember({
      body: {
        userId: created.userId,
        organizationId: created.organizationId as string,
        role: "client_owner",
      } as never,
    });
    await deps.auth.api.requestPasswordReset({
      body: { email, redirectTo: deps.redirectTo },
    });
    const setupUrl = deps.setup.take(email);
    if (!setupUrl) throw new Error("the set-password link was not issued");

    await withAgency(db, async (tx) => {
      await tx
        .update(onboardingRequests)
        .set({
          status: "approved",
          handledAt: new Date(),
          handledBy: scope.userId,
          clientId: created.clientId as string,
        })
        .where(eq(onboardingRequests.id, requestId));
      await writeAudit(tx, {
        actor: { type: "user", id: scope.userId },
        clientId: created.clientId as string,
        action: "core.approve_onboarding",
        input: { requestId },
        decision: "executed",
      });
    });
    return { clientId: created.clientId as string, setupUrl };
  } catch (error) {
    await withAgency(db, async (tx) => {
      if (created.clientId) await tx.delete(clients).where(eq(clients.id, created.clientId));
      if (created.organizationId) {
        await tx.delete(organizations).where(eq(organizations.id, created.organizationId));
      }
      if (created.userId) await tx.delete(users).where(eq(users.id, created.userId));
    }).catch((cleanupError) => {
      // A failed cleanup leaves an orphan someone must remove by hand: say so loudly.
      console.error(
        JSON.stringify({
          level: "error",
          message: "onboarding cleanup failed",
          requestId,
          created,
          error: String(cleanupError),
        }),
      );
    });
    deps.setup.take(email);
    throw error;
  }
}

export async function rejectOnboardingRequest(
  db: Database,
  scope: Scope,
  requestId: string,
  reason: string,
): Promise<void> {
  assertCanDecide(scope);
  await withAgency(db, async (tx) => {
    await loadOpen(tx, requestId);
    await tx
      .update(onboardingRequests)
      .set({ status: "rejected", handledAt: new Date(), handledBy: scope.userId, reason })
      .where(eq(onboardingRequests.id, requestId));
  });
}
