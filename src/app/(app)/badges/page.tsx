import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { computeBadges } from "@/lib/badges";
import { BadgeGrid } from "@/components/badges/badge-grid";
import { Card } from "@/components/ui/card";
import type { Result, SpeakingSubmission } from "@/types/database";

export default async function BadgesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: results }, { data: speaking }] = await Promise.all([
    supabase
      .from("results")
      .select("skill, raw, total, band, submitted_at")
      .eq("user_id", profile.id),
    supabase.from("speaking_submissions").select("score, created_at").eq("user_id", profile.id),
  ]);

  const badges = computeBadges({
    streak: profile.streak,
    longestStreak: profile.longest_streak,
    xp: profile.xp,
    results: (results ?? []) as Pick<
      Result,
      "skill" | "raw" | "total" | "band" | "submitted_at"
    >[],
    speaking: (speaking ?? []) as Pick<SpeakingSubmission, "score" | "created_at">[],
  });

  const earned = badges.filter((b) => b.earned).length;
  const pct = Math.round((earned / badges.length) * 100);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Badges 🏅</h1>
        <p className="text-muted">Earn badges by practising, hitting streaks, and acing tests.</p>
      </div>

      <Card className="bg-brand-gradient text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/85">Badges earned</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums">
              {earned}
              <span className="text-xl font-bold text-white/70"> / {badges.length}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold tabular-nums">{pct}%</p>
            <p className="text-xs text-white/70">complete</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <BadgeGrid badges={badges} />
    </div>
  );
}
