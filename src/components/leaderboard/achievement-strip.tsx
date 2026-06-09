import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Achievement } from "@/types/database";

// Persisted, server-trusted achievements (migration 0016). Distinct from the
// rich on-the-fly badge wall at /badges — these gate on the verified rating
// engine (rating tiers, perfect scores, streaks, completions).
export function AchievementStrip({
  achievements,
  earned,
}: {
  achievements: Achievement[];
  earned: Map<string, string>; // id -> earned_at ISO
}) {
  const got = achievements.filter((a) => earned.has(a.id)).length;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">Ranking achievements</h2>
        <span className="text-xs font-semibold tabular-nums text-muted">
          {got} / {achievements.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {achievements.map((a) => {
          const has = earned.has(a.id);
          return (
            <div
              key={a.id}
              title={`${a.name} — ${a.description}`}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-2.5 text-sm transition-colors",
                has
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-surface-2/40 opacity-60 grayscale",
              )}
            >
              <span className="text-xl">{a.icon}</span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{a.name}</p>
                <p className="truncate text-[11px] text-muted">
                  {has ? "Unlocked" : a.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
