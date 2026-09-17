// Hide one practice question by its source hash. The admin panel does this with
// a button; this exists for the moment before the panel is deployed.
//
//   node scripts/unpublish-practice.mjs <hash-prefix>
//
// It NEVER deletes: attempts reference the question with `on delete restrict`,
// so removing a row would mean removing a student's essay.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const prefix = process.argv[2];
if (!prefix || !/^[0-9a-f]{6,64}$/i.test(prefix)) {
  console.error("usage: node scripts/unpublish-practice.mjs <hash-prefix>");
  process.exit(1);
}

const { url, serviceKey } = loadEnv();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("writing_practice")
  .update({ published: false, updated_at: new Date().toISOString() })
  .like("source_hash", `${prefix.toLowerCase()}%`)
  .select("id, topic, prompt");
if (error) throw new Error(error.message);

for (const row of data ?? []) console.log(`hidden  [${row.topic}] ${row.prompt}`);
console.log(`\n${(data ?? []).length} question(s) hidden.`);
