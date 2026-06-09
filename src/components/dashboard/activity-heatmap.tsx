import { Card } from "@/components/ui/card";

// GitHub-style contribution grid of test activity over the last ~13 weeks.
// `dates` is a flat list of ISO timestamps (one per completed test/session).
export function ActivityHeatmap({ dates }: { dates: string[] }) {
  const WEEKS = 13;
  const DAY = 86_400_000;

  const counts = new Map<string, number>();
  for (const iso of dates) {
    const key = new Date(iso).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Align the grid so the last column ends on today; first column starts on a Sunday.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (WEEKS * 7 - 1) * DAY);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday

  const weeks: { key: string; level: number; label: string }[][] = [];
  let cursor = new Date(start);
  let total = 0;
  while (cursor <= today) {
    const week: { key: string; level: number; label: string }[] = [];
    for (let d = 0; d < 7; d++) {
      const key = cursor.toISOString().slice(0, 10);
      const n = cursor <= today ? counts.get(key) ?? 0 : -1;
      if (n > 0) total += n;
      week.push({
        key,
        level: n < 0 ? -1 : n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3,
        label: `${n > 0 ? n : "No"} test${n === 1 ? "" : "s"} · ${new Date(key).toLocaleDateString()}`,
      });
      cursor = new Date(cursor.getTime() + DAY);
    }
    weeks.push(week);
  }

  const levelClass = (lvl: number) =>
    lvl < 0
      ? "bg-transparent"
      : lvl === 0
        ? "bg-surface-2"
        : lvl === 1
          ? "bg-primary/30"
          : lvl === 2
            ? "bg-primary/60"
            : "bg-primary";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">Activity</h3>
        <span className="text-xs text-muted">
          <strong className="text-foreground tabular-nums">{total}</strong> in last {WEEKS} weeks
        </span>
      </div>

      <div className="mt-3 flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell) => (
              <div
                key={cell.key}
                title={cell.label}
                className={`h-3 w-3 rounded-[3px] ${levelClass(cell.level)}`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted">
        <span>Less</span>
        <div className="h-3 w-3 rounded-[3px] bg-surface-2" />
        <div className="h-3 w-3 rounded-[3px] bg-primary/30" />
        <div className="h-3 w-3 rounded-[3px] bg-primary/60" />
        <div className="h-3 w-3 rounded-[3px] bg-primary" />
        <span>More</span>
      </div>
    </Card>
  );
}
