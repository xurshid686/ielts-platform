import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import { premiumMemberIds } from "@/lib/premium-members";
import { AchievementStrip } from "@/components/leaderboard/achievement-strip";
import { groupLeaderboard, groupOf } from "@/lib/friends";
import type { SkillBoardRow } from "@/components/leaderboard/leaderboard";
import type {
  Achievement,
  LeaderboardGlobalRow,
  LeaderboardPeriodRow,
  UserAchievement,
} from "@/types/database";

export const metadata = { title: "Leaderboard" };

// Top 10 only (owner, 2026-11-24). A student below it still sees their own
// row pinned under the list (leaderboard.tsx, `me && !meInList`).
const TOP = 10;

export default async function LeaderboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // 0079 skill ladders: top 10 + the viewer's own row on each. The views are
  // newer than the generated types, hence the untyped `from`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sk = supabase as any;
  const board = async (view: string) => {
    const [top, me] = await Promise.all([
      sk.from(view).select("*").order("rank").limit(TOP),
      sk.from(view).select("*").eq("id", profile.id).maybeSingle(),
    ]);
    return { rows: (top.data ?? []) as SkillBoardRow[], me: (me.data as SkillBoardRow | null) ?? null, error: top.error };
  };
  const [overallB, listeningB, writingB] = await Promise.all([
    board("leaderboard_overall"),
    board("leaderboard_listening"),
    board("leaderboard_writing"),
  ]);
  // Before migration 0079 the views don't exist: fall back to the Reading-only board.
  const skillBoards = overallB.error ? undefined : { overall: overallB, listening: listeningB, writing: writingB };

  const [groupsWeekly, groupsRating, myGroup] = await Promise.all([
    groupLeaderboard("weekly"),
    groupLeaderboard("rating"),
    groupOf(profile.id),
  ]);
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

  // Paid members shine (gold ring + name) wherever they appear on the board.
  const shownIds = [
    ...[global, weekly, monthly].flatMap((q) => (q.data ?? []).map((r) => r.id as string)),
    ...(skillBoards ? [overallB, listeningB, writingB].flatMap((b) => b.rows.map((r) => r.id)) : []),
  ];
  const premiumIds = [...(await premiumMemberIds([...shownIds, profile.id]))];

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
        premiumIds={premiumIds}
        groups={{ weekly: groupsWeekly, rating: groupsRating }}
        skillBoards={skillBoards}
        myGroupId={myGroup?.id ?? null}
      />
      {achs.data && achs.data.length > 0 && (
        <AchievementStrip achievements={achs.data as Achievement[]} earned={earned} />
      )}
    </div>
  );
}
