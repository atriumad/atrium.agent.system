import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../../../scripts/migrate";
import { createDatabase, userDisplayNames, withAgency } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const ids: [string, string] = [`un-a-${suffix}`, `un-b-${suffix}`];

beforeAll(async () => {
  await migrate(ADMIN_URL);
  for (const [i, id] of ids.entries()) {
    await admin.unsafe("insert into core.users (id, name, email) values ($1, $2, $3)", [
      id,
      `Person ${i}`,
      `${id}@un.atrium.dev`,
    ]);
  }
});

afterAll(async () => {
  await admin.unsafe("delete from core.users where id = $1 or id = $2", [ids[0], ids[1]]);
  await admin.close();
  await close();
});

describe("userDisplayNames", () => {
  test("maps ids to names and nothing else; unknown ids are absent", async () => {
    const names = await withAgency(db, (tx) =>
      userDisplayNames(tx, [...ids, "missing-user", ids[0]]),
    );
    expect(names).toBeInstanceOf(Map);
    expect([...names.entries()].sort()).toEqual([
      [ids[0], "Person 0"],
      [ids[1], "Person 1"],
    ]);
    expect(JSON.stringify([...names])).not.toContain("@");
  });

  test("an empty list is an empty map", async () => {
    expect((await withAgency(db, (tx) => userDisplayNames(tx, []))).size).toBe(0);
  });
});
