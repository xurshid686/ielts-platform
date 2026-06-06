import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { TestRunner } from "@/components/test-runner";
import type { Test } from "@/types/database";

export async function TestDetail({
  skill,
  id,
}: {
  skill: "reading" | "listening";
  id: string;
}) {
  await requireProfile();
  const supabase = await createClient();

  const { data: test } = await supabase
    .from("tests")
    .select("*")
    .eq("id", id)
    .eq("skill", skill)
    .single();

  if (!test) notFound();
  const t = test as Test;

  // Server-graded tests have a stored answer key — the manual score-entry
  // fallback is hidden for them (their score can't be hand-entered).
  const graded = !!t.answer_key && Object.keys(t.answer_key).length > 0;

  return <TestRunner testId={t.id} title={t.title} skill={skill} graded={graded} />;
}
