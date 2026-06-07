import { CheckCircle2, TrendingUp, Wand2 } from "lucide-react";
import type { WritingFeedback } from "@/types/database";

const CRITERIA: { key: keyof WritingFeedback["criteria"]; label: string }[] = [
  { key: "task", label: "Task" },
  { key: "coherence", label: "Coherence & Cohesion" },
  { key: "lexical", label: "Lexical Resource" },
  { key: "grammar", label: "Grammar" },
];

function tone(b: number) {
  if (b >= 7) return "text-success";
  if (b >= 5.5) return "text-warning";
  return "text-danger";
}

export function WritingFeedbackView({ feedback }: { feedback: WritingFeedback }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10">
          <span className={`text-3xl font-extrabold ${tone(feedback.overallBand)}`}>
            {feedback.overallBand}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted">band</span>
        </div>
        <div>
          <h3 className="font-semibold">Overall band {feedback.overallBand}</h3>
          <p className="text-sm text-muted">{feedback.comment}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CRITERIA.map(({ key, label }) => {
          const c = feedback.criteria[key];
          return (
            <div key={key} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted">{label}</span>
                <span className={`text-lg font-bold ${tone(c.band)}`}>{c.band}</span>
              </div>
              <p className="mt-1 text-sm">{c.comment}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> Strengths
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-success">•</span>{s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <TrendingUp className="h-4 w-4" /> To improve
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {feedback.improvements.map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-warning">•</span>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {feedback.corrections?.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4 text-primary" /> Suggested corrections
          </h4>
          <ul className="mt-3 space-y-3 text-sm">
            {feedback.corrections.map((c, i) => (
              <li key={i} className="space-y-1">
                <p className="text-danger line-through decoration-danger/40">{c.original}</p>
                <p className="text-success">{c.better}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
