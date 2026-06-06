import { CheckCircle2, TrendingUp } from "lucide-react";
import type { SpeakingFeedback } from "@/types/database";

const CRITERIA: { key: keyof SpeakingFeedback["criteria"]; label: string }[] = [
  { key: "fluency", label: "Fluency & Coherence" },
  { key: "lexical", label: "Lexical Resource" },
  { key: "grammar", label: "Grammar" },
  { key: "pronunciation", label: "Pronunciation" },
];

function bandTone(band: number) {
  if (band >= 7) return "text-success";
  if (band >= 5.5) return "text-warning";
  return "text-danger";
}

export function FeedbackView({ feedback }: { feedback: SpeakingFeedback }) {
  return (
    <div className="space-y-5">
      {/* Overall band */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10">
          <span className={`text-3xl font-extrabold ${bandTone(feedback.overallBand)}`}>
            {feedback.overallBand}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted">band</span>
        </div>
        <div>
          <h3 className="font-semibold">Overall band {feedback.overallBand}</h3>
          <p className="text-sm text-muted">
            Estimated by AI from the official IELTS Speaking descriptors. Use it as
            guidance, not an official result.
          </p>
        </div>
      </div>

      {/* Criteria */}
      <div className="grid gap-3 sm:grid-cols-2">
        {CRITERIA.map(({ key, label }) => {
          const c = feedback.criteria[key];
          return (
            <div key={key} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted">{label}</span>
                <span className={`text-lg font-bold ${bandTone(c.band)}`}>{c.band}</span>
              </div>
              <p className="mt-1 text-sm">{c.comment}</p>
            </div>
          );
        })}
      </div>

      {/* Strengths & improvements */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> Strengths
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-success">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <TrendingUp className="h-4 w-4" /> To improve
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {feedback.improvements.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-warning">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Per-part notes */}
      {feedback.partFeedback?.length > 0 && (
        <div className="space-y-2">
          {feedback.partFeedback.map((p) => (
            <div key={p.part} className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                Part {p.part}
              </span>
              <p className="mt-1 text-sm">{p.comment}</p>
            </div>
          ))}
        </div>
      )}

      {/* Transcript */}
      {feedback.transcript && (
        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            View transcript
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
            {feedback.transcript}
          </p>
        </details>
      )}
    </div>
  );
}
