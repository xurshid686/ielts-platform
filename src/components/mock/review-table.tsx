import { Check, X } from "lucide-react";
import type { ReviewLine } from "@/lib/mock";
import { cn } from "@/lib/utils";

/**
 * Per-question breakdown of a listening or reading section, rendered on the
 * server. Used by the admin attempt page and by a student's RELEASED result —
 * the only two places a mock's correct answers ever reach a browser.
 */
export function ReviewTable({ lines }: { lines: ReviewLine[] }) {
  if (!lines.length) return <p className="text-sm text-muted">No answers recorded.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="py-2 pr-3 font-medium">Q</th>
            <th className="py-2 pr-3 font-medium">Answer given</th>
            <th className="py-2 pr-3 font-medium">Correct answer</th>
            <th className="py-2 font-medium" aria-label="Result" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.q} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-3 tabular-nums text-muted">{l.q}</td>
              <td className={cn("py-1.5 pr-3", !l.given && "italic text-muted")}>
                {l.given || "—"}
              </td>
              <td className="py-1.5 pr-3">{l.accepted.join(" / ")}</td>
              <td className="py-1.5">
                {l.correct ? (
                  <Check className="h-4 w-4 text-success" aria-label="correct" />
                ) : (
                  <X className="h-4 w-4 text-danger" aria-label="wrong" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
