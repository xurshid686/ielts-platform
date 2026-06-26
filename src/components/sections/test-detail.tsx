import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { canAccessTest, unlockCost } from "@/lib/premium";
import { canAccessTrack } from "@/lib/levels";
import { TestRunner } from "@/components/test-runner";
import { UnlockButton } from "@/components/sections/unlock-button";
import { PremiumContact } from "@/components/premium-contact";
import type { Test } from "@/types/database";

export async function TestDetail({
  skill,
  id,
}: {
  skill: "reading" | "listening";
  id: string;
}) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: test } = await supabase
    .from("tests")
    .select("*")
    .eq("id", id)
    .eq("skill", skill)
    .single();

  if (!test) notFound();
  const t = test as Test;

  // Level gate: a Pre-IELTS / Intro test is only openable by students of that
  // level (admins pass). Treat it as not-found for everyone else.
  if (!canAccessTrack(profile, t.track)) notFound();

  // Has the user unlocked this specific premium test with XP?
  let unlocked = false;
  if (t.tier === "premium") {
    const { data: u } = await supabase
      .from("unlocks")
      .select("id")
      .eq("user_id", profile.id)
      .eq("test_id", t.id)
      .limit(1);
    unlocked = Array.isArray(u) && u.length > 0;
  }

  // Premium tests are locked unless subscriber/admin/unlocked.
  if (!canAccessTest(profile, t, unlocked)) {
    const cost = unlockCost(t);
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <Link
          href={`/${skill}`}
          className="mb-8 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {skill}
        </Link>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 shadow-soft">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-white">
            <Crown className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">This is a Premium test</h1>
          <p className="mt-2 text-sm text-muted">
            This{" "}
            <strong>
              {t.kind === "full"
                ? "full test"
                : skill === "reading"
                  ? t.passage
                    ? `Passage ${t.passage}`
                    : "passage"
                  : "section"}
            </strong>{" "}
            is available to Premium members. Unlock it with <strong>{cost} XP</strong>, or
            ask an administrator to upgrade your account.
          </p>
          <UnlockButton testId={t.id} cost={cost} xp={profile.xp} />
        </div>
        <PremiumContact className="mt-4 text-left" />
      </div>
    );
  }

  // Server-graded tests have a stored answer key — the manual score-entry
  // fallback is hidden for them (their score can't be hand-entered).
  const graded = !!t.answer_key && Object.keys(t.answer_key).length > 0;

  return (
    <TestRunner
      testId={t.id}
      title={t.title}
      skill={skill}
      graded={graded}
      isMyStudent={profile.is_my_student}
    />
  );
}
