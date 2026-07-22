import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rawToBand } from "@/lib/ielts/bandTable";
import { gradeAnswers, asAnswerKey, asAnswers } from "@/lib/ielts/grade";

// Grades an attempt at a shareable (is_public) test. Requires a signed-in
// user — test taking is login-only. Grades server-side from the stored answer
// key and returns the score/band — it PERSISTS NOTHING (no results row, no XP,
// no rating). Saving goes through the authenticated saveResult() path instead.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { testId, answers, skill } = (body ?? {}) as {
    testId?: string;
    answers?: unknown;
    skill?: string;
  };
  if (!testId) return NextResponse.json({ error: "Missing testId" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("tests")
    .select("answer_key, is_public, skill")
    .eq("id", testId)
    .single();

  const test = row as
    | { answer_key?: unknown; is_public?: boolean; skill?: "reading" | "listening" }
    | null;
  if (!test || test.is_public !== true) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = asAnswerKey(test.answer_key);
  if (!key) {
    // No stored key → we can't grade a public test honestly (and we won't trust a
    // client score for an anonymous user). Treat as unavailable.
    return NextResponse.json({ error: "This test cannot be graded." }, { status: 409 });
  }

  const gradeSkill: "reading" | "listening" =
    test.skill === "listening" || skill === "listening" ? "listening" : "reading";
  const graded = gradeAnswers(key, asAnswers(answers) ?? {});
  const band = rawToBand(gradeSkill, graded.raw, graded.total);

  return NextResponse.json({ raw: graded.raw, total: graded.total, band });
}
