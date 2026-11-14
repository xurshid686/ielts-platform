import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { reportFilename } from "@/lib/mock-report";
import { getCheck } from "@/lib/writing-ai";
import { renderAiCheckPdf, type AiReportData } from "@/lib/writing-ai-report";
import { buildPractice, fmt } from "@/lib/writing-ai-telegram";
import { EMAIL_BASE_URL, emailConfigured, sendWritingCheckEmail } from "@/lib/email/send";

// A Premium student's finished PRACTICE check, emailed to them with the report
// attached as a PDF (student variant: logo + website, no internal credentials).
//
// Mock checks are never emailed from here: a mock's AI draft is private until the
// owner releases it, and the released-result email already covers that.
// Like every sender it NEVER throws and never blocks the check; the outcome is
// stamped on the row (email_sent_at / email_error).

export type EmailDeliverResult = { ok: true } | { ok: false; error: string };

/** The student's copy: same data, minus the owner-only credentials. */
function studentData(data: AiReportData, student: string, checkedAt: string): AiReportData {
  return {
    title: "AI writing check",
    draftNote: null,
    credentials: [
      { label: "Name", value: student },
      { label: "Checked", value: checkedAt },
    ],
    tasks: data.tasks,
  };
}

export async function deliverCheckEmail(checkId: string): Promise<EmailDeliverResult> {
  const supabase = createAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const stamp = async (patch: Record<string, unknown>) => {
    await supabase.from("writing_ai_checks").update(patch).eq("id", checkId);
  };
  try {
    const check = await getCheck(checkId);
    if (!check || check.status !== "done") return { ok: false, error: "Only a finished check can be emailed." };
    if (check.source !== "practice") return { ok: false, error: "Only practice checks are emailed." };
    if (check.email_sent_at) return { ok: true };
    if (!emailConfigured()) {
      await stamp({ email_error: "Email isn't configured." });
      return { ok: false, error: "Email isn't configured." };
    }

    const built = await buildPractice(checkId);
    if (!built || !check.user_id) {
      await stamp({ email_error: "The attempt could not be loaded." });
      return { ok: false, error: "The attempt could not be loaded." };
    }
    const email = built.data.credentials.find((c) => c.label === "Email")?.value;
    if (!email || email === "-") {
      await stamp({ email_error: "No email address on file." });
      return { ok: false, error: "No email address on file." };
    }

    const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" }).format(
      new Date(check.finished_at ?? check.created_at),
    );
    const pdf = await renderAiCheckPdf(studentData(built.data, built.student, when), { variant: "student" });
    const kindLabel = built.sourceLabel.replace(/^Practice - /, "").replace(/ \(Task 1 \+ Task 2\)$/, "");
    const day = (check.finished_at ?? check.created_at).slice(0, 10);
    const res = await sendWritingCheckEmail({
      to: email,
      name: built.student,
      kindLabel,
      bands: check.results.map((r) => ({ label: `Task ${r.task} overall`, band: fmt(r.overall) })),
      historyUrl: `${EMAIL_BASE_URL}/writing/history/${check.practice_attempt_id}`,
      pdf: { filename: reportFilename(["AI writing check", built.student, kindLabel, day], "pdf"), content: pdf },
    });
    if (!res.sent) {
      console.error(`[writing-ai] email failed: ${res.error}`);
      await stamp({ email_error: (res.error ?? "Email failed").slice(0, 300) });
      return { ok: false, error: res.error ?? "Email failed" };
    }
    await stamp({ email_sent_at: new Date().toISOString(), email_error: null });
    return { ok: true };
  } catch (e) {
    console.error("[writing-ai] deliverCheckEmail failed", e);
    const error = e instanceof Error ? e.message.slice(0, 300) : "unknown error";
    await stamp({ email_error: error }).catch(() => null);
    return { ok: false, error };
  }
}
