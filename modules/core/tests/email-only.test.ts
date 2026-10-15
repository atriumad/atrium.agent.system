import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../../../scripts/migrate";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const admin = new SQL(ADMIN_URL);

beforeAll(async () => {
  await migrate(ADMIN_URL);
});
afterAll(async () => {
  await admin.close();
});

describe("the schema is email only", () => {
  test("no channel, source, invitation or signal check still allows SMS", async () => {
    const rows = (await admin.unsafe(
      `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
         from pg_constraint
        where conname in ('consents_channel_check', 'consents_source_check', 'notifications_channel_check',
                          'survey_invitations_channel_check', 'signals_daily_signal_type_check')
          and conrelid::regclass::text not like '%\\_20%'`,
    )) as { tbl: string; conname: string; def: string }[];
    expect(rows.map((r) => r.conname).sort()).toEqual([
      "consents_channel_check",
      "consents_source_check",
      "notifications_channel_check",
      "signals_daily_signal_type_check",
      "survey_invitations_channel_check",
    ]);
    for (const row of rows) expect(row.def.toLowerCase()).not.toContain("sms");
    const source = rows.find((r) => r.conname === "consents_source_check")?.def ?? "";
    expect(source).toContain("email_bounce");
    expect(source).toContain("email_complaint");
  });

  test("the package table has no carrier registration column", async () => {
    const cols = (await admin.unsafe(
      `select column_name from information_schema.columns
        where table_schema = 'core' and table_name = 'client_packages'`,
    )) as { column_name: string }[];
    expect(cols.map((c) => c.column_name)).not.toContain("sms_registered");
  });
});
