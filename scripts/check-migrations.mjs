// One-off read-only check: is migration 0020 (leaderboard visibility) applied?
// Uses the service role key. (0019, the referral program, was removed by 0068.)
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const { url, serviceKey } = loadEnv();
const supabase = createClient(url, serviceKey);

async function colExists(table, col) {
  const { error } = await supabase.from(table).select(col).limit(1);
  return !error;
}
async function tableExists(table) {
  const { error } = await supabase.from(table).select("id").limit(1);
  return !error || !/does not exist|find the table/i.test(error.message);
}
async function fnExists(name, args) {
  const { error } = await supabase.rpc(name, args);
  // Function present if the error is NOT "function ... does not exist".
  if (!error) return true;
  return !/Could not find the function|does not exist/i.test(error.message);
}

const results = {
  "0020 · profiles.hidden_from_leaderboard": await colExists(
    "profiles",
    "hidden_from_leaderboard",
  ),
  "0020 · set_leaderboard_hidden()": await fnExists("set_leaderboard_hidden", {
    target_email: "__none@none__",
    hidden: false,
  }),
};

let allOk = true;
for (const [label, ok] of Object.entries(results)) {
  if (!ok) allOk = false;
  console.log(`${ok ? "✅" : "❌ MISSING"}  ${label}`);
}
console.log(
  allOk
    ? "\nBoth migrations are applied. 🎉"
    : "\nSome objects are missing — the marked migration still needs to be run.",
);
