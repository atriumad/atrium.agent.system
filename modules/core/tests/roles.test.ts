import { describe, expect, test } from "bun:test";
import {
  can,
  isAgencyRole,
  PERMISSION_MATRIX,
  ROLES,
  roleAllowedInOrganization,
} from "../domain/roles";

describe("permission matrix", () => {
  test("only agency_admin manages the portfolio", () => {
    expect(ROLES.filter((r) => can(r, "portfolio", "manage"))).toEqual(["agency_admin"]);
  });

  test("clients never see the portfolio", () => {
    expect(can("client_owner", "portfolio", "read")).toBe(false);
    expect(can("client_staff", "portfolio", "read")).toBe(false);
  });

  test("the owner approves content, their staff only views it", () => {
    expect(can("client_owner", "content", "approve")).toBe(true);
    expect(can("client_staff", "content", "approve")).toBe(false);
    expect(can("client_staff", "content", "read")).toBe(true);
  });

  test("only account managers and admins fire tasks", () => {
    expect(ROLES.filter((r) => can(r, "task", "fire"))).toEqual([
      "agency_admin",
      "account_manager",
    ]);
  });

  test("every role has a row in the matrix", () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...ROLES].sort());
  });
});

describe("roles per organization", () => {
  test("agency roles belong to the agency, client roles to clients", () => {
    for (const role of ROLES) {
      expect(roleAllowedInOrganization(role, true)).toBe(isAgencyRole(role));
      expect(roleAllowedInOrganization(role, false)).toBe(!isAgencyRole(role));
    }
  });
});
