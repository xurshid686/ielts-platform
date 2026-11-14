// Probe the Axiom evaluations API and find out HOW results come back.
//
//   node scripts/axiom-probe.mjs            login only (free, changes nothing)
//   node scripts/axiom-probe.mjs --submit   also send ONE short Task 2 essay,
//                                           then poll get-evaluations for it
//
// Reads AXIOM_BASE_URL / AXIOM_PHONE / AXIOM_PASSWORD from .env.local (or the
// process env). Prints no secret. The answer it is after: after
// process-evaluation, does the evaluation show up in get-evaluations (so we can
// poll instead of holding a SignalR connection), and how do we match it?
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(AXIOM_[A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").replace(/\\\$/g, "$");
  }
} catch {}

const base = (process.env.AXIOM_BASE_URL ?? "").replace(/\/+$/, "");
const { AXIOM_PHONE: phone, AXIOM_PASSWORD: password } = process.env;
if (!base || !phone || !password) {
  console.error("Set AXIOM_BASE_URL, AXIOM_PHONE and AXIOM_PASSWORD in .env.local first.");
  process.exit(1);
}
console.log("target:", base);

const res = await fetch(`${base}/accounts/authenticate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phoneNumber: phone, password }),
});
console.log("login:", res.status);
const body = await res.json().catch(() => ({}));
if (!res.ok || !body.jwtToken) {
  console.error("login failed; response keys:", Object.keys(body));
  process.exit(1);
}
const auth = { Authorization: `Bearer ${body.jwtToken}`, "Content-Type": "application/json" };
console.log("login ok; role:", body.role, "| set-cookie present:", !!res.headers.get("set-cookie"));

const list = async (n = 5) => {
  const qs = new URLSearchParams({
    "sortDescription.ColumnName": "CreatedAt",
    "sortDescription.IsDescending": "true",
    PageSize: String(n),
    PageNumber: "1",
  });
  const r = await fetch(`${base}/evaluations/get-evaluations?${qs}`, { headers: auth });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const before = await list();
console.log("list:", before.status, "| total:", before.json?.total, "| newest:", before.json?.data?.[0]?.createdAt);

if (!process.argv.includes("--submit")) {
  console.log("\nLogin works. Re-run with --submit to send one essay and see how the result arrives.");
  process.exit(0);
}

const topic = "Some people believe that technology has made our lives more complicated. To what extent do you agree or disagree?";
const essay =
  "In today's world, technology plays a central role in daily life. Some people claim it has made life more complicated, but I largely disagree.\n\n" +
  "Firstly, technology has simplified communication and access to information. People can contact anyone instantly and find answers online in seconds.\n\n" +
  "However, constant connectivity can cause stress, and privacy is a genuine concern. Even so, sensible habits and education can reduce these problems.\n\n" +
  "In conclusion, technology has made most things easier, provided it is used wisely.";

const t0 = Date.now();
const sub = await fetch(`${base}/evaluations/process-evaluation`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ type: 1, task: 2, topic, body: essay, maxToken: 1500, ipAddress: "127.0.0.1", connectionId: randomUUID() }),
});
console.log("submit:", sub.status, await sub.text().then((t) => t.slice(0, 300)));
console.log("(no SignalR client here, so the pushed result is deliberately ignored)");

for (let i = 1; i <= 12; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const now = await list();
  const hit = now.json?.data?.find((e) => e.body?.trim() === essay.trim() || e.title === topic);
  console.log(`poll ${i} (+${Math.round((Date.now() - t0) / 1000)}s): total=${now.json?.total}`, hit ? "FOUND" : "not yet");
  if (hit) {
    console.log("matched id:", hit.id, "| score:", hit.score, "| result is a", typeof hit.result, "of", String(hit.result).length, "chars");
    const d = await fetch(`${base}/evaluations/get-evaluation-detail?id=${hit.id}`, { headers: auth });
    const dj = await d.json().catch(() => ({}));
    console.log("detail:", d.status, "keys:", Object.keys(dj).join(", "));
    console.log("bands:", { overall: dj.overall, ta: dj.taskAchievement, cc: dj.cohesionAndCoherence, lr: dj.lexicalResource, gra: dj.grammaticalRange });
    break;
  }
}
