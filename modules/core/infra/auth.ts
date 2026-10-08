import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import { asc, eq } from "drizzle-orm";
import {
  isRole,
  PERMISSION_MATRIX,
  PERMISSIONS,
  ROLES,
  roleAllowedInOrganization,
  TEAM_ROLES,
} from "../domain/roles";
import { authSchema, members } from "./auth-schema";
import type { Database } from "./db";

const ORG_RESOURCES = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
} as const;

/** Organization-level powers (invite, remove people). Content permissions come from the matrix. */
const ORG_GRANTS = {
  agency_admin: {
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
  },
  client_owner: { invitation: ["create", "cancel"] },
} as const;

const ac = createAccessControl({ ...ORG_RESOURCES, ...PERMISSIONS });

function buildRoles() {
  const roles: Record<string, ReturnType<typeof ac.newRole>> = {};
  for (const role of ROLES) {
    const grants = ORG_GRANTS[role as keyof typeof ORG_GRANTS] ?? {};
    roles[role] = ac.newRole({ ...PERMISSION_MATRIX[role], ...grants } as never);
  }
  return roles;
}

export type AuthConfig = {
  secret: string;
  baseURL: string;
  /** Slug of the agency organization. Every other organization is a client. */
  agencySlug: string;
  /** Origins allowed to send sign-in requests besides `baseURL`, e.g. the web apps. */
  trustedOrigins?: string[];
  /** Receives the one-time set-password link for a new owner. Email delivery plugs in here. */
  onPasswordSetup?: (input: { email: string; url: string }) => Promise<void>;
};

export function createAuth(db: Database, config: AuthConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    user: { modelName: "users" },
    session: { modelName: "sessions" },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    ...(config.trustedOrigins ? { trustedOrigins: config.trustedOrigins } : {}),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      resetPasswordTokenExpiresIn: 7 * 24 * 3600,
      ...(config.onPasswordSetup
        ? {
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) =>
              config.onPasswordSetup?.({ email: user.email, url }),
          }
        : {}),
    },
    databaseHooks: {
      session: {
        create: {
          // Everyone here belongs to one organization (the agency, or one client), so a new
          // session starts in it. Without this the scope resolves to nothing after sign-in.
          before: async (session) => {
            const [first] = await db
              .select({ organizationId: members.organizationId })
              .from(members)
              .where(eq(members.userId, session.userId))
              .orderBy(asc(members.createdAt))
              .limit(1);
            return {
              data: { ...session, activeOrganizationId: first?.organizationId ?? null },
            };
          },
        },
      },
    },
    plugins: [
      organization({
        ac,
        roles: buildRoles(),
        // Organizations are provisioned by Atrium (agency), never self-served.
        allowUserToCreateOrganization: false,
        schema: {
          organization: { modelName: "organizations" },
          member: {
            modelName: "members",
            additionalFields: {
              teamRole: { type: "string", required: false, input: true },
            },
          },
          invitation: { modelName: "invitations" },
        },
        organizationHooks: {
          beforeAddMember: async ({ member, organization: org }) => {
            assertMembership(member.role, org.slug, config.agencySlug);
            assertTeamRole(member.teamRole);
          },
          beforeCreateInvitation: async ({ invitation, organization: org }) => {
            assertMembership(invitation.role, org.slug, config.agencySlug);
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

function assertMembership(role: string, orgSlug: string, agencySlug: string) {
  if (!isRole(role)) throw new Error(`unknown role: ${role}`);
  if (!roleAllowedInOrganization(role, orgSlug === agencySlug)) {
    throw new Error(`role ${role} is not allowed in organization ${orgSlug}`);
  }
}

function assertTeamRole(teamRole: unknown) {
  if (teamRole == null) return;
  if (!(TEAM_ROLES as readonly unknown[]).includes(teamRole)) {
    throw new Error(`unknown team role: ${String(teamRole)}`);
  }
}
