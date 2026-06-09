import { Card } from "@/components/ui/card";

export type Criterion = { label: string; band: number | null };

// Horizontal band bars (0–9) for the four speaking criteria, averaged across
// all graded speaking sessions.
export function CriteriaBars({ criteria }: { criteria: Criterion[] }) {
  const has = criteria.some((c) => c.band != null);

  return (
    <Card>
      <h3 className="text-sm font-medium text-muted">Speaking breakdown</h3>
      {!has ? (
        <p className="mt-6 mb-4 text-center text-sm text-muted">
          Finish a speaking session to see your per-criterion bands.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {criteria.map((c) => {
            const pct = c.band != null ? (c.band / 9) * 100 : 0;
            return (
              <div key={c.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted">{c.label}</span>
                  <span className="font-semibold tabular-nums">
                    {c.band != null ? c.band.toFixed(1) : "—"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-brand-gradient transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
