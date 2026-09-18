// Add ONE Writing Task 1 practice question (migration 0058) from the command
// line — the same thing the "Add Task 1" form on /admin/writing-practice does
// (createTask1Question in src/lib/writing-practice.ts), for when the picture is
// on this machine rather than in the owner's browser.
//
//   node scripts/add-task1-practice.mjs --image="C:\path\chart.jpg" --chart=pie \
//     --prompt="The pie charts show …"            # goes in UNPUBLISHED
//   node scripts/add-task1-practice.mjs ... --publish
//
// The sentence is stored exactly as given (no spelling or quote "fixes").
// Identity is the same sha256 the form uses — "task1\n" + normalised sentence
// + "\n" + the picture's bytes — so running it twice is refused, not doubled.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const CHARTS = ["pie", "bar", "line", "table", "map", "process", "mixed"];
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const image = arg("image");
const chart = arg("chart");
const prompt = (arg("prompt") ?? "").trim();
const publish = process.argv.includes("--publish");

if (!image || !prompt || !CHARTS.includes(chart ?? "")) {
  console.error(`usage: --image=<file> --chart=<${CHARTS.join("|")}> --prompt="<sentence>" [--publish] [--env=live|local]`);
  process.exit(1);
}
const contentType = TYPES[extname(image).toLowerCase()];
if (!contentType) {
  console.error(`Not an image type I know: ${extname(image)}`);
  process.exit(1);
}

loadEnv();
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const bytes = readFileSync(image);
if (bytes.length > 5 * 1024 * 1024) {
  console.error("Keep the picture under 5 MB.");
  process.exit(1);
}
const normalised = prompt.normalize("NFC").replace(/\s+/g, " ").trim();
const sourceHash = createHash("sha256").update("task1\n").update(normalised, "utf8").update("\n").update(bytes).digest("hex");

const { data: dupe } = await supabase.from("writing_practice").select("id, published").eq("source_hash", sourceHash).maybeSingle();
if (dupe) {
  console.log(`Already in the library: ${dupe.id} (published: ${dupe.published}).`);
  if (publish && !dupe.published) {
    const { error } = await supabase
      .from("writing_practice")
      .update({ published: true, updated_at: new Date().toISOString() })
      .eq("id", dupe.id);
    if (error) throw new Error(error.message);
    console.log("Published it.");
  }
  process.exit(0);
}

const path = `task1/${randomUUID()}${extname(image).toLowerCase()}`;
const { error: upErr } = await supabase.storage.from("writing-practice").upload(path, bytes, { contentType, upsert: false });
if (upErr) throw new Error(upErr.message);

const { data, error } = await supabase
  .from("writing_practice")
  .insert({
    task: 1,
    topic: null,
    chart,
    image_path: path,
    prompt,
    source_hash: sourceHash,
    appearances: 1,
    published: publish,
  })
  .select("id")
  .single();
if (error) {
  await supabase.storage.from("writing-practice").remove([path]);
  throw new Error(error.message);
}
console.log(`Added ${data.id} (${chart}, ${publish ? "PUBLISHED" : "unpublished"}), picture at ${path}.`);
