// Run one migration file against the chosen database.
//
// There is no psql and no Supabase CLI on this machine, and
// db.<ref>.supabase.co does not resolve — so DDL goes through the `pg` driver
// on the pooler, which is the recipe every migration since 0040 has used.
//
//   node scripts/apply-migration.mjs supabase/migrations/0057_writing_practice.sql
//   node scripts/apply-migration.mjs <file> --env=local
//
// The whole file runs in ONE transaction: a migration that fails half way is
// worse than one that does not run. The target database is printed by
// loadEnv() before anything happens — read it before answering yes.
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadEnv } from "./env.mjs";

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("usage: node scripts/apply-migration.mjs <path-to.sql> [--env=live|local]");
  process.exit(1);
}

const { name } = loadEnv();
const ref = process.env.NEW_PROJECT_REF;
const password = process.env.NEW_DB_PASS;
if (!ref || !password) {
  console.error("Need NEW_PROJECT_REF and NEW_DB_PASS (they are in .env.frankfurt).");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
console.log(`applying ${file} to ${name} (project ${ref})`);
console.log(`${sql.split(/\r?\n/).length} lines\n`);

const client = new pg.Client({
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${ref}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("✅ applied and committed.");
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("❌ rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
