// Models the four SERIAL round trips /reading makes today:
//   1. middleware.ts:35   auth.getUser()      (token revalidation)
//   2. auth.ts:16         auth.getUser()      (getProfile)
//   3. auth.ts:21         select from profiles
//   4. skill-section      select from tests   (+ results, in parallel)
import { readFileSync } from "node:fs";
const read = f => Object.fromEntries(readFileSync(f,"utf8").split(/\r?\n/)
  .map(l=>l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m=>[m[1],m[2]]));
const envs = { SYDNEY: read(".env.local"), FRANKFURT: read(".env.frankfurt") };

async function timeOne(env) {
  const base = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const h = { apikey: key, authorization: `Bearer ${key}` };
  const t0 = Date.now();
  await fetch(`${base}/auth/v1/user`, { headers: h });                                   // 1
  await fetch(`${base}/auth/v1/user`, { headers: h });                                   // 2
  await fetch(`${base}/rest/v1/profiles?select=id&limit=1`, { headers: h });             // 3
  await Promise.all([                                                                    // 4
    fetch(`${base}/rest/v1/tests?select=id,title,skill,kind,tier,question_types,times_done,total,level,passage,created_at,track&skill=eq.reading&order=created_at.desc`, { headers: h }),
    fetch(`${base}/rest/v1/results?select=id&limit=1`, { headers: h }),
  ]);
  return Date.now() - t0;
}

for (const [name, env] of Object.entries(envs)) {
  await timeOne(env); // warm TLS
  const runs = [];
  for (let i = 0; i < 7; i++) runs.push(await timeOne(env));
  runs.sort((a,b)=>a-b);
  const med = runs[Math.floor(runs.length/2)];
  console.log(`${name.padEnd(10)} median ${String(med).padStart(5)}ms   runs: ${runs.join(", ")}`);
}
