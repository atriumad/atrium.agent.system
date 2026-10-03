/**
 * Applies every module's SQL migrations, in module order then file order, as the owner role.
 * Creates the application role first: the app never connects as the owner, so RLS always applies.
 * Usage: bun scripts/migrate.ts   (needs DATABASE_ADMIN_URL)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";

const MODULE_ORDER = ["core", "signals"];
const ROOT = join(import.meta.dir, "..");

export async function migrate(adminUrl = process.env.DATABASE_ADMIN_URL): Promise<string[]> {
  if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is not set");
  const sql = new SQL(adminUrl);
  const applied: string[] = [];
  try {
    const appPassword = process.env.ATRIUM_APP_PASSWORD ?? "atrium_app";
    const exists = await sql`select 1 from pg_roles where rolname = 'atrium_app'`;
    if (exists.length === 0) {
      await sql.unsafe(
        `create role atrium_app login password '${appPassword.replaceAll("'", "''")}'`,
      );
    }
    await sql.unsafe(`
      create table if not exists public.schema_migrations (
        module text not null, name text not null, applied_at timestamptz not null default now(),
        primary key (module, name)
      )`);

    const modules = [
      ...MODULE_ORDER,
      ...readdirSync(join(ROOT, "modules")).filter((m) => !MODULE_ORDER.includes(m)),
    ];
    for (const module of modules) {
      const dir = join(ROOT, "modules", module, "migrations");
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const name of files) {
        const done =
          await sql`select 1 from public.schema_migrations where module = ${module} and name = ${name}`;
        if (done.length > 0) continue;
        await sql.begin(async (tx) => {
          await tx.unsafe(readFileSync(join(dir, name), "utf8"));
          await tx`insert into public.schema_migrations (module, name) values (${module}, ${name})`;
        });
        applied.push(`${module}/${name}`);
      }
    }
  } finally {
    await sql.close();
  }
  return applied;
}

if (import.meta.main) {
  const applied = await migrate();
  console.log(applied.length ? `applied:\n${applied.join("\n")}` : "up to date");
}
