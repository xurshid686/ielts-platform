import { createAdminClient } from "@/lib/supabase/admin";
import { gradeAnswers, asAnswerKey, asAnswers } from "@/lib/ielts/grade";
import { rawToBand } from "@/lib/ielts/bandTable";

// Grades a test taken by a visitor with NO account.
//
// The public catalogue lets anyone start a free test — proving the product is
// worth more than any amount of marketing copy. This is where that attempt is
// scored. It deliberately PERSISTS NOTHING: no result row, no XP, no rating, no
// streak. Saving a score is the thing an account buys you, and it is what the
// result screen invites the visitor to do.
//
// What it returns is only the score. It does NOT return the answer key or
// per-question correctness: that is the paid review, and handing it to an
// anonymous caller would give the whole library's answers away to a script.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const { testId, answers } = (body ?? {}) as { testId?: unknown; answers?: unknown };
  if (typeof testId !== "string" || !testId) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Service-role: `answer_key` is not readable by the anon role (migration 0034).
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("tests")
    .select("skill, tier, track, answer_key")
    .eq("id", testId)
    .single();

  const test = row as {
    skill?: "reading" | "listening";
    tier?: string;
    track?: string | null;
    answer_key?: unknown;
  } | null;

  if (!test) return Response.json({ error: "Not found" }, { status: 404 });

  // Same gate as the content route: only free, regular-track material is open
  // to a guest. Without this check a guest could grade a premium test they were
  // never served, which leaks how many they got right on paid content.
  if (test.tier === "premium" || (test.track ?? "regular") !== "regular") {
    return Response.json({ error: "Not available" }, { status: 403 });
  }

  const key = asAnswerKey(test.answer_key);
  if (!key) return Response.json({ error: "This test cannot be scored" }, { status: 409 });

  const graded = gradeAnswers(key, asAnswers(answers) ?? {});
  const skill = test.skill === "listening" ? "listening" : "reading";
  const band = rawToBand(skill, graded.raw, graded.total);

  return Response.json(
    { raw: graded.raw, total: graded.total, band },
    { headers: { "Cache-Control": "no-store" } },
  );
}
