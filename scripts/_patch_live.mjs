// usage: node scripts/_patch_live.mjs <spec.json> [--apply] ; spec: {id, backupDir, edits:[{block:"correctAnswers|explanations|evidence", find:<regex source>, replace:<string>}...], key:{"19":["d"],...}}
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs"; import { fileStore } from "./storage.mjs";
import { readFileSync, writeFileSync } from "node:fs"; import { randomUUID } from "node:crypto";
loadEnv(); process.env.STORAGE_BACKEND = "r2";
const spec = JSON.parse(readFileSync(process.argv[2], "utf8")); const apply = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row } = await db.from("tests").select("id,title,file_path,answer_key").eq("id", spec.id).single();
const { count } = await db.from("results").select("id", { count: "exact", head: true }).eq("test_id", spec.id);
console.log(row.title, "| attempts:", count);
const store = fileStore("tests", db);
const html = Buffer.from(await (await store.download(row.file_path)).data.arrayBuffer()).toString("utf8");
function span(src, name) {
  const m = new RegExp(String.raw`(?<![\w.])` + name + String.raw`\s*=\s*\{`).exec(src); if (!m) throw new Error("no block " + name);
  const i = m.index + m[0].length - 1; let d = 0, str = null, esc = false, j = i;
  for (; j < src.length; j++) { const c = src[j]; if (str) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === str) str = null; continue; } if (c === '"' || c === "'") { str = c; continue; } if (c === "{") d++; else if (c === "}" && --d === 0) { j++; break; } }
  return [i, j];
}
let out = html;
// apply edits per block, all finds evaluated against the ORIGINAL block text so rotations don't chain
const byBlock = {}; for (const e of spec.edits) (byBlock[e.block] ??= []).push(e);
for (const [name, es] of Object.entries(byBlock)) {
  const [a, b] = span(out, name); const orig = out.slice(a, b); let nb = orig; const repl = [];
  for (const e of es) { const re = new RegExp(e.find, "g"); const ms = [...orig.matchAll(re)]; if (ms.length !== 1) throw new Error(`${name}: /${e.find}/ matched ${ms.length}x`); repl.push([ms[0].index, ms[0][0].length, e.replace]); }
  repl.sort((x, y) => y[0] - x[0]); for (const [i, l, r] of repl) nb = nb.slice(0, i) + r + nb.slice(i + l);
  out = out.slice(0, a) + nb + out.slice(b); console.log(" ", name, es.length, "edit(s) ok");
}
if (!apply) { console.log("dry run; bytes", out.length - html.length); process.exit(0); }
writeFileSync(`${spec.backupDir}/${spec.id}.orig.html`, html);
const np = `reading/patched-${randomUUID()}.html`;
const up = await store.upload(np, Buffer.from(out, "utf8"), { contentType: "text/html", upsert: false }); if (up.error) throw new Error(up.error.message);
const { data: pub } = store.getPublicUrl(np);
const u = await db.from("tests").update({ file_path: np, file_url: pub.publicUrl, answer_key: { ...row.answer_key, ...spec.key } }).eq("id", spec.id); if (u.error) throw new Error(u.error.message);
console.log("APPLIED", np, "(old object kept:", row.file_path + ")");
