import { Card } from "@/components/ui/card";
import { TIER_STYLES, type BadgeStatus, type BadgeGroup } from "@/lib/badges";

const GROUP_ORDER: BadgeGroup[] = [
  "Milestones",
  "Streaks",
  "Mastery",
  "Precision",
  "Explorer",
  "Quirky",
];

export function BadgeGrid({ badges }: { badges: BadgeStatus[] }) {
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    items: badges.filter((b) => b.def.group === g),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {groups.map(({ group, items }) => {
        const earned = items.filter((b) => b.earned).length;
        return (
          <section key={group}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{group}</h2>
              <span className="text-sm text-muted tabular-nums">
                {earned}/{items.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((b) => (
                <BadgeCard key={b.def.id} badge={b} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function BadgeCard({ badge }: { badge: BadgeStatus }) {
  const { def, earned, earnedAt, progress } = badge;
  const tier = TIER_STYLES[def.tier];

  const pct =
    progress && progress.target > 0
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0;

  return (
    <Card
      className={`flex flex-col items-center text-center transition-all ${
        earned ? `ring-2 ${tier.ring}` : "opacity-70"
      }`}
    >
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full text-3xl ${
          earned ? "bg-surface-2" : "bg-surface-2 grayscale"
        }`}
      >
        <span className={earned ? "" : "opacity-50"}>{def.emoji}</span>
      </div>

      <h3 className="mt-2 text-sm font-semibold">{def.name}</h3>
      <span className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tier.chip}`}>
        {tier.label}
      </span>
      <p className="mt-2 text-xs text-muted">{def.description}</p>

      {earned ? (
        <p className="mt-2 text-[11px] font-medium text-success">
          {earnedAt
            ? `Earned ${new Date(earnedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}`
            : "Earned"}
        </p>
      ) : progress ? (
        <div className="mt-2 w-full">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted tabular-nums">
            {progress.current}/{progress.target}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted">Locked</p>
      )}
    </Card>
  );
}
