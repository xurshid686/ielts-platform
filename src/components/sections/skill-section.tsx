import { BookOpen, Headphones } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { avg } from "@/lib/utils";
import { isPremiumActive } from "@/lib/premium";
import { Card } from "@/components/ui/card";
import { TestBrowser, type BrowserItem } from "@/components/sections/test-browser";
import { RecentBandsChart, type RecentBandPoint } from "@/components/sections/recent-bands";
import { PremiumSection } from "@/components/sections/premium-section";
import type { Result, Test } from "@/types/database";

const META = {
  reading: { title: "Reading", icon: BookOpen, blurb: "Academic passages with instant scoring." },
  listening: { title: "Listening", icon: Headphones, blurb: "Audio tests scored as you submit." },
} as const;

export async function SkillSection({ skill }: { skill: "reading" | "listening" }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Note: file_url/file_path are intentionally NOT selected — premium content
  // is fetched only via /api/test-html (which gates access).
  const baseCols =
    "id, title, skill, kind, tier, question_types, times_done, total, level, passage, created_at";
  async function fetchTests(): Promise<Test[]> {
    // Include `track` (0021) but fall back gracefully if the migration is pending.
    const withTrack = await supabase
      .from("tests")
      .select(`${baseCols}, track`)
      .eq("skill", skill)
      .order("created_at", { ascending: false });
    if (!withTrack.error) return (withTrack.data ?? []) as unknown as Test[];
    if (!/track/.test(withTrack.error.message)) return [];
    const fallback = await supabase
      .from("tests")
      .select(baseCols)
      .eq("skill", skill)
      .order("created_at", { ascending: false });
    return (fallback.data ?? []) as unknown as Test[];
  }

  const [tests, { data: results }, { data: unlocks }] = await Promise.all([
    fetchTests(),
    supabase
      .from("results")
      .select("*")
      .eq("user_id", profile.id)
      .eq("skill", skill)
      .order("submitted_at", { ascending: false }),
    supabase.from("unlocks").select("test_id").eq("user_id", profile.id),
  ]);

  const unlockedIds = ((unlocks ?? []) as { test_id: string }[]).map((u) => u.test_id);

  // Only the normal IELTS tests belong on these pages; level-specific tests
  // (pre_ielts / intro) live in their own menus. Missing track = regular.
  const testList = ((tests ?? []) as Test[]).filter((t) => (t.track ?? "regular") === "regular");
  const res = (results ?? []) as Result[];
  const canAccessPremium = profile.role === "admin" || isPremiumActive(profile);

  // Enrich each test with the user's attempt count + best band. Newest uploads
  // first so freshly added tests appear at the top.
  const items: BrowserItem[] = [...testList]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((t) => {
      const attempts = res.filter((r) => r.test_id === t.id);
      const bandAttempts = attempts.filter((a) => a.band != null).map((a) => Number(a.band));
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
        best: bandAttempts.length ? Math.max(...bandAttempts) : null,
        createdAt: t.created_at,
      };
    });

  const bands = res.filter((r) => r.band != null).map((r) => Number(r.band));
  const average = avg(bands);
  const best = bands.length ? Math.max(...bands) : null;

  const Meta = META[skill];
  const Icon = Meta.icon;
  // Last 12 scored attempts with dates, oldest first (chart order).
  const recent: RecentBandPoint[] = res
    .filter((r) => r.band != null)
    .slice(0, 12)
    .reverse()
    .map((r) => ({ band: Number(r.band), at: r.submitted_at }));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{Meta.title}</h1>
          <p className="text-muted">{Meta.blurb}</p>
        </div>
      </div>

      {/* Stats + compact progress graph side by side, so tests stay above the fold */}
      <section
        className={recent.length >= 2 ? "grid gap-4 lg:grid-cols-[1fr_1.7fr]" : undefined}
      >
        <div
          className={`grid grid-cols-3 gap-4 ${recent.length >= 2 ? "lg:grid-cols-1" : ""}`}
        >
          <Card className="flex flex-col justify-center">
            <p className="text-sm text-muted">Average band</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{average ?? "—"}</p>
          </Card>
          <Card className="flex flex-col justify-center">
            <p className="text-sm text-muted">Best band</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{best ?? "—"}</p>
          </Card>
          <Card className="flex flex-col justify-center">
            <p className="text-sm text-muted">Tests taken</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{res.length}</p>
          </Card>
        </div>

        <RecentBandsChart
          points={recent}
          color={skill === "reading" ? "var(--primary)" : "var(--accent)"}
          avgColor={skill === "reading" ? "var(--accent)" : "var(--primary)"}
        />
      </section>

      {/* Premium materials — their own highlighted section */}
      <PremiumSection
        items={items.filter((i) => i.tier === "premium")}
        skill={skill}
        canAccess={canAccessPremium}
        unlockedIds={unlockedIds}
        xp={profile.xp}
        isAdmin={profile.role === "admin"}
      />

      {/* Free tests with search + filter */}
      <TestBrowser
        items={items.filter((i) => i.tier === "free")}
        skill={skill}
        canAccessPremium={canAccessPremium}
        isAdmin={profile.role === "admin"}
      />
    </div>
  );
}
