import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import { AchievementStrip } from "@/components/leaderboard/achievement-strip";
import type {
  Achievement,
  LeaderboardGlobalRow,
  LeaderboardPeriodRow,
  UserAchievement,
} from "@/types/database";

export const metadata = { title: "Leaderboard" };

const TOP = 100;

export default async function LeaderboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [global, weekly, monthly, meGlobal, meWeekly, meMonthly, achs, mine] = await Promise.all([
    supabase.from("leaderboard_global").select("*").order("rank").limit(TOP),
    supabase.from("leaderboard_weekly").select("*").order("rank").limit(TOP),
    supabase.from("leaderboard_monthly").select("*").order("rank").limit(TOP),
    supabase.from("leaderboard_global").select("*").eq("id", profile.id).maybeSingle(),
    supabase.from("leaderboard_weekly").select("*").eq("id", profile.id).maybeSingle(),
    supabase.from("leaderboard_monthly").select("*").eq("id", profile.id).maybeSingle(),
    supabase.from("achievements").select("*").order("sort"),
    supabase.from("user_achievements").select("achievement_id, earned_at").eq("user_id", profile.id),
  ]);

  const earned = new Map<string, string>(
    ((mine.data ?? []) as Pick<UserAchievement, "achievement_id" | "earned_at">[]).map((r) => [
      r.achievement_id,
      r.earned_at,
    ]),
  );

  return (
    <div className="space-y-6">
      <Leaderboard
        meId={profile.id}
        global={(global.data ?? []) as LeaderboardGlobalRow[]}
        weekly={(weekly.data ?? []) as LeaderboardPeriodRow[]}
        monthly={(monthly.data ?? []) as LeaderboardPeriodRow[]}
        meGlobal={(meGlobal.data as LeaderboardGlobalRow | null) ?? null}
        meWeekly={(meWeekly.data as LeaderboardPeriodRow | null) ?? null}
        meMonthly={(meMonthly.data as LeaderboardPeriodRow | null) ?? null}
      />
      {achs.data && achs.data.length > 0 && (
        <AchievementStrip achievements={achs.data as Achievement[]} earned={earned} />
      )}
    </div>
  );
}
