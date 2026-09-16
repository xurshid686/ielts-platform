import { FileDown } from "lucide-react";

/**
 * Save a mock result as a file (owner, 2026-09-16). Plain links, not buttons:
 * /api/mock-report streams the document with Content-Disposition, so the browser
 * downloads it without any client-side work — the same route serves the
 * student's own result, an admin's copy of any attempt, and a whole mock.
 */
export function ReportDownloads({
  attemptId,
  mockId,
  label = "Save result",
}: {
  attemptId?: string;
  mockId?: string;
  label?: string;
}) {
  const q = attemptId ? `attempt=${attemptId}` : `mock=${mockId}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted">{label}:</span>
      {(["pdf", "docx"] as const).map((f) => (
        <a
          key={f}
          href={`/api/mock-report?${q}&format=${f}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-surface-2"
        >
          <FileDown className="h-4 w-4" /> {f === "pdf" ? "PDF" : "Word"}
        </a>
      ))}
    </span>
  );
}
