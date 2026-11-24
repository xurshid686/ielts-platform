"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bug, Check, Loader2, RotateCcw, X } from "lucide-react";
import { reopenTestReport, resolveReport } from "@/app/actions/test-reports";
import { categoryLabel, REPORT_FIXED_XP, type ReportStatus } from "@/lib/test-reports-shared";
import type { TestReportRow } from "@/lib/test-reports";

const TABS: { id: ReportStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "fixed", label: "Fixed" },
  { id: "dismissed", label: "Not a problem" },
];

function shortBrowser(ua: string | null): string {
  if (!ua) return "";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ");
}

export function AdminReports({
  status,
  counts,
  reports,
}: {
  status: ReportStatus;
  counts: Record<ReportStatus, number>;
  reports: TestReportRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, start] = useTransition();

  // How many reports each test has in this list — a test reported 3 times is the one to fix first.
  const perTest = new Map<string, number>();
  for (const r of reports) perTest.set(r.test_id, (perTest.get(r.test_id) ?? 0) + 1);

  function act(id: string, fn: () => Promise<{ ok: boolean; error?: string; rewarded?: boolean; already?: boolean }>, done: string) {
    setBusy(id);
    setMsg(null);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Something went wrong." });
      if (res.already) return setMsg({ ok: true, text: "Already closed (maybe by another click)." });
      setMsg({ ok: true, text: res.rewarded ? `${done} The student got +${REPORT_FIXED_XP} XP and a thank-you.` : done });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Bug className="h-6 w-6 text-primary" /> Problem reports
        </h1>
        <p className="text-muted">
          Sent by students from the test player. <b>Fixed</b> gives the student +{REPORT_FIXED_XP} XP and a thank-you
          (once). <b>Not a problem</b> closes it quietly.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/reports?status=${t.id}`}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              status === t.id ? "bg-primary text-white shadow-soft" : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="tabular-nums opacity-80">{counts[t.id]}</span>
          </Link>
        ))}
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted shadow-soft">
          {status === "open" ? "No open reports. Nothing to fix right now." : "Nothing here yet."}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          {reports.map((r) => {
            const skill = r.test?.skill === "listening" ? "listening" : "reading";
            const many = perTest.get(r.test_id) ?? 1;
            return (
              <li key={r.id} className="space-y-2 p-4" data-report={r.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {categoryLabel(r.category)}
                  </span>
                  <Link href={`/${skill}/${r.test_id}`} target="_blank" className="font-medium hover:underline">
                    {r.test?.title ?? "Deleted test"}
                  </Link>
                  <span className="text-xs text-muted">{skill}</span>
                  {r.question && <span className="text-xs font-semibold">Q{r.question}</span>}
                  {many > 1 && (
                    <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                      {many} reports
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.message}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">
                    {r.student?.name || r.student?.email || "Deleted account"}
                    {r.student?.email && r.student?.name ? ` · ${r.student.email}` : ""} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                    {shortBrowser(r.user_agent) && ` · ${shortBrowser(r.user_agent)}`}
                    {r.status === "fixed" && r.rewarded && ` · +${REPORT_FIXED_XP} XP paid`}
                  </p>
                  <div className="flex gap-2">
                    {r.status === "open" ? (
                      <>
                        <button
                          onClick={() => act(r.id, () => resolveReport(r.id, "dismissed"), "Closed as not a problem.")}
                          disabled={busy === r.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" /> Not a problem
                        </button>
                        <button
                          onClick={() => act(r.id, () => resolveReport(r.id, "fixed"), "Marked as fixed.")}
                          disabled={busy === r.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Fixed
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => act(r.id, () => reopenTestReport(r.id), "Reopened.")}
                        disabled={busy === r.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                        title="Move back to Open (XP already paid is kept, and never paid twice)"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reopen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
