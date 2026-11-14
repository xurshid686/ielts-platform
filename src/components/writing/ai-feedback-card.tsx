import { Card } from "@/components/ui/card";
import type { AiTaskResult } from "@/lib/writing-ai-shared";

const fmt = (b: number | null) => (b == null ? "—" : b.toFixed(1));

/**
 * Axiom's feedback, one block per task. Pure markup, so it renders on the server
 * (student result page, admin page) and inside the client panel alike.
 *
 * `showBands` decides whether Axiom's NUMBERS appear. Practice shows them,
 * labelled as an estimate; a released mock never does — the only numbers a mock
 * student sees are the owner's (the caller passes withoutBands() data anyway,
 * so a forgotten flag still cannot print one).
 */
export function AiFeedbackCard({
  results,
  showBands,
  heading = "AI feedback",
  note,
}: {
  results: AiTaskResult[];
  showBands: boolean;
  heading?: string;
  note?: string;
}) {
  if (!results.length) return null;
  const several = results.length > 1;
  return (
    <Card className="space-y-6 p-6" data-ai-feedback>
      <div className="space-y-1">
        <h2 className="text-lg font-bold">{heading}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>

      {results.map((t) => (
        <section key={t.task} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {(several || !showBands) && <h3 className="text-base font-semibold">Task {t.task}</h3>}
            {showBands && (
              <span className="rounded-md bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary tabular-nums">
                {several ? "" : `Task ${t.task} · `}AI estimate: band {fmt(t.overall)}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {t.criteria.map((c) => (
              <div key={c.key} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold">{c.label}</h4>
                  {showBands && (
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-semibold tabular-nums">
                      {fmt(c.band)}
                    </span>
                  )}
                </div>
                {c.description && <p className="mt-2 text-sm leading-relaxed">{c.description}</p>}
                {c.suggestions.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                    {c.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                {c.revisions.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium text-primary">
                      Sentence improvements ({c.revisions.length})
                    </summary>
                    <ul className="mt-2 space-y-3">
                      {c.revisions.map((r, i) => (
                        <li key={i} className="space-y-1 rounded-lg bg-surface-2 p-3">
                          <p className="text-muted line-through decoration-danger/50">{r.original}</p>
                          <p className="font-medium">{r.revised}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </Card>
  );
}
