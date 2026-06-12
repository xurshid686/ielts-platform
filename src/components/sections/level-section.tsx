import { BookOpen, Headphones } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isPremiumActive } from "@/lib/premium";
import { LEVELS, type ContentLevel } from "@/lib/levels";
import { EmptyState } from "@/components/ui/empty-state";
import { TestBrowser, type BrowserItem } from "@/components/sections/test-browser";
import type { Profile, Result, Test } from "@/types/database";

const ICONS = { pre_ielts: BookOpen, intro: Headphones } as const;

/**
 * The Pre-IELTS / Intro landing page: the reading + listening tests assigned to
 * that level (tests.track), each reusing the normal TestBrowser card grid.
 */
export async function LevelSection({
  level,
  profile,
}: {
  level: ContentLevel;
  profile: Profile;
}) {
  const supabase = await createClient();
  const meta = LEVELS[level];
  const Icon = ICONS[level];

  const [{ data: tests }, { data: results }] = await Promise.all([
    supabase
      .from("tests")
      .select(
        "id, title, skill, kind, tier, question_types, times_done, total, level, passage, created_at, track",
      )
      .eq("track", level)
      .order("created_at", { ascending: false }),
    supabase.from("results").select("*").eq("user_id", profile.id),
  ]);

  const testList = (tests ?? []) as Test[];
  const res = (results ?? []) as Result[];
  const canAccessPremium = profile.role === "admin" || isPremiumActive(profile);

  const toItem = (t: Test): BrowserItem => {
    const attempts = res.filter((r) => r.test_id === t.id);
    const bands = attempts.filter((a) => a.band != null).map((a) => Number(a.band));
    return {
      id: t.id,
      title: t.title,
      kind: t.kind ?? "single",
      tier: t.tier ?? "free",
      passage: t.passage,
      level: t.level,
      questionTypes: t.question_types ?? [],
      questionCount: t.total ?? null,
      timesDone: t.times_done ?? 0,
      attempts: attempts.length,
      best: bands.length ? Math.max(...bands) : null,
      createdAt: t.created_at,
    };
  };

  const reading = testList.filter((t) => t.skill === "reading").map(toItem);
  const listening = testList.filter((t) => t.skill === "listening").map(toItem);

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{meta.label}</h1>
          <p className="text-muted">{meta.blurb}</p>
        </div>
      </div>

      {reading.length === 0 && listening.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No tests yet"
          desc="Your teacher will add tests for this level soon — check back shortly."
        />
      ) : (
        <div className="space-y-12">
          {reading.length > 0 && (
            <TestBrowser
              items={reading}
              skill="reading"
              canAccessPremium={canAccessPremium}
              isAdmin={profile.role === "admin"}
            />
          )}
          {listening.length > 0 && (
            <TestBrowser
              items={listening}
              skill="listening"
              canAccessPremium={canAccessPremium}
              isAdmin={profile.role === "admin"}
            />
          )}
        </div>
      )}
    </div>
  );
}
