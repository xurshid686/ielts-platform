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

  return <TestRunner testId={t.id} title={t.title} skill={skill} />;
}
