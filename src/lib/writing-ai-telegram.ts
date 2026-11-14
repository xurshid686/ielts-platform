import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendDocument } from "@/lib/telegram/api";
import { escapeHtml } from "@/lib/telegram/format";
import { promptLines } from "@/lib/ielts/writing-prompt";
import { countWords } from "@/lib/mock-shared";
import { getAttemptDetail } from "@/lib/mock";
import { imageMeta, reportFilename, type ReportImage } from "@/lib/mock-report";
import { getAttemptForAdmin } from "@/lib/writing-practice";
import { getCheck, readImage } from "@/lib/writing-ai";
import { renderAiCheckPdf, type AiReportData, type AiReportTask } from "@/lib/writing-ai-report";
import { MONTHLY_CHECKS, type AiTaskResult } from "@/lib/writing-ai-shared";
import { EMAIL_BASE_URL } from "@/lib/email/send";

// (The student's emailed copy lives in writing-ai-email.ts.)
// Every completed AI check is posted, as a PDF, to the owner's writing group.
//
// STUDENTS ARE NEVER TOLD (owner, 2026-11-14): nothing a student can load —
// a page, an action result, an email, a PDF — mentions this. It is the same
// one-way-push contract as src/lib/telegram/notify.ts: it NEVER throws and never
// blocks the student's check, and with no chat configured it does nothing.
//
// The destination is TELEGRAM_WRITING_CHAT_ID (a group or channel the admin bot
// is an admin of). On the dev preview, point it at the owner's own chat so
// tests never post into the real group.

function chatId(): string | null {
  const raw = process.env.TELEGRAM_WRITING_CHAT_ID?.trim();
  return raw || null;
}

export function writingPdfConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN) && chatId() !== null;
}

const tashkent = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) + " (Tashkent)"
    : "-";

export const fmt = (b: number | null | undefined) => (b == null ? "-" : b.toFixed(1));

function resultOf(results: AiTaskResult[], n: 1 | 2): AiTaskResult | null {
  return results.find((r) => r.task === n) ?? null;
}

export type Built = { data: AiReportData; student: string; sourceLabel: string; adminPath: string };

async function profileFor(userId: string | null) {
  if (!userId) return null;
  const { data } = await createAdminClient().from("profiles").select("id, name, email, premium_until").eq("id", userId).maybeSingle();
  return (data as { id: string; name: string | null; email: string | null; premium_until: string | null } | null) ?? null;
}

async function toReportImage(bucket: string, path: string | null | undefined): Promise<ReportImage | null> {
  const img = await readImage(bucket, path);
  return img ? imageMeta(Buffer.from(img.bytes)) : null;
}

export async function buildPractice(checkId: string): Promise<Built | null> {
  const check = await getCheck(checkId);
  if (!check?.practice_attempt_id) return null;
  const a = await getAttemptForAdmin(check.practice_attempt_id);
  if (!a) return null;
  const prof = await profileFor(check.user_id);

  // Quota line: live practice checks this month, this one included.
  let usedLine = "-";
  if (check.user_id) {
    const { count } = await (createAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient)
      .from("writing_ai_checks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", check.user_id)
      .eq("month", check.month)
      .eq("source", "practice")
      .in("status", ["pending", "done"]);
    usedLine = `${count ?? 0} of ${MONTHLY_CHECKS} (${check.month})`;
  }

  const image = a.kind !== "task2" ? await toReportImage("writing-practice", a.image_path) : null;
  const tasks: AiReportTask[] = [];
  if (a.kind === "task2") {
    tasks.push({ n: 2, lines: promptLines(2, a.prompt), words: countWords(a.answer), essay: a.answer, image: null, result: resultOf(check.results, 2) });
  } else {
    tasks.push({ n: 1, lines: promptLines(1, a.prompt), words: countWords(a.answer), essay: a.answer, image, result: resultOf(check.results, 1) });
    if (a.kind === "full") {
      tasks.push({ n: 2, lines: promptLines(2, a.prompt2), words: countWords(a.answer2), essay: a.answer2 ?? "", image: null, result: resultOf(check.results, 2) });
    }
  }

  const student = a.student?.trim() || prof?.name?.trim() || a.email || "Student";
  const kind = a.kind === "full" ? "Full test (Task 1 + Task 2)" : a.kind === "task1" ? "Task 1" : "Task 2";
  return {
    student,
    sourceLabel: `Practice - ${kind}`,
    adminPath: `/admin/writing-practice/attempts/${a.id}`,
    data: {
      title: "AI writing check",
      draftNote: null,
      credentials: [
        { label: "Student", value: student },
        { label: "Email", value: a.email ?? prof?.email ?? "-" },
        { label: "Student id", value: check.user_id ?? "-" },
        { label: "Premium until", value: prof?.premium_until ? tashkent(prof.premium_until) : "none" },
        { label: "Source", value: `Writing practice - ${kind}` },
        { label: "Checked", value: tashkent(check.finished_at ?? check.created_at) },
        { label: "Handed in", value: tashkent(a.submitted_at) },
        { label: "Checks this month", value: usedLine },
        { label: "Axiom evaluation", value: check.results.map((r) => `T${r.task} ${r.axiomId}`).join("  ") || "-" },
      ],
      tasks,
    },
  };
}

async function buildMock(checkId: string): Promise<Built | null> {
  const check = await getCheck(checkId);
  if (!check?.mock_attempt_id) return null;
  const detail = await getAttemptDetail(check.mock_attempt_id);
  if (!detail) return null;
  const a = detail.attempt;
  const prof = await profileFor(check.user_id ?? a.user_id);
  const image = await toReportImage("mock-assets", a.writing_task1_image_path ?? detail.mock?.writing_task1_image_path);

  const student = a.student_name?.trim() || prof?.name?.trim() || a.student_email || "Student";
  const mockTitle = detail.mock?.title ?? "Mock exam";
  return {
    student,
    sourceLabel: `Mock - ${mockTitle}`,
    adminPath: `/admin/mocks/attempts/${a.id}`,
    data: {
      title: "AI writing check - mock exam",
      draftNote: "DRAFT: for the teacher only. Not released to the student; the student never sees Axiom's scores.",
      credentials: [
        { label: "Student", value: student },
        { label: "Email", value: a.student_email ?? prof?.email ?? "-" },
        { label: "Student id", value: a.user_id ?? "-" },
        { label: "Premium until", value: prof?.premium_until ? tashkent(prof.premium_until) : "none" },
        { label: "Source", value: `Mock exam - ${mockTitle}` },
        { label: "Attempt id", value: a.id },
        { label: "Checked", value: tashkent(check.finished_at ?? check.created_at) },
        { label: "Writing handed in", value: tashkent(a.writing_submitted_at) },
        { label: "Axiom evaluation", value: check.results.map((r) => `T${r.task} ${r.axiomId}`).join("  ") || "-" },
      ],
      tasks: [
        { n: 1, lines: promptLines(1, a.writing_task1_prompt), words: countWords(a.writing_task1), essay: a.writing_task1 ?? "", image, result: resultOf(check.results, 1) },
        { n: 2, lines: promptLines(2, a.writing_task2_prompt), words: countWords(a.writing_task2), essay: a.writing_task2 ?? "", image: null, result: resultOf(check.results, 2) },
      ],
    },
  };
}

/** A short, ASCII-safe file name: "Writing check - Name - Task 2 - 2026-11-14.pdf". */
export function filenameOf(student: string, sourceLabel: string, when: string): string {
  return reportFilename(["Writing check", student, sourceLabel.replace(/^(Practice|Mock) - /, ""), when.slice(0, 10)], "pdf");
}

export type DeliverResult = { ok: true } | { ok: false; error: string };

/**
 * Post one finished check to the writing group and stamp the outcome on the row.
 * Idempotent per call, never throws. `force` is the owner's "Send again".
 */
export async function deliverCheckPdf(checkId: string, opts: { force?: boolean } = {}): Promise<DeliverResult> {
  const supabase = createAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const stamp = async (patch: Record<string, unknown>) => {
    await supabase.from("writing_ai_checks").update(patch).eq("id", checkId);
  };
  try {
    const to = chatId();
    if (!to || !process.env.TELEGRAM_BOT_TOKEN) return { ok: false, error: "Telegram writing group is not configured." };

    const check = await getCheck(checkId);
    if (!check || check.status !== "done") return { ok: false, error: "Only a finished check can be sent." };
    if (check.telegram_sent_at && !opts.force) return { ok: true };

    const built = check.source === "mock" ? await buildMock(checkId) : await buildPractice(checkId);
    if (!built) {
      await stamp({ telegram_error: "The attempt could not be loaded." });
      return { ok: false, error: "The attempt could not be loaded." };
    }

    const pdf = await renderAiCheckPdf(built.data, { variant: "owner" });
    const bands = check.results.map((r) => `T${r.task} ${fmt(r.overall)}`).join(" / ");
    const caption = [
      `<b>AI writing check</b> - ${escapeHtml(built.sourceLabel)}`,
      escapeHtml(built.student),
      `Axiom: ${escapeHtml(bands || "-")}${check.source === "mock" ? " (draft)" : ""}`,
      `${EMAIL_BASE_URL}${built.adminPath}`,
    ].join("\n");

    const res = await sendDocument(
      to,
      { data: pdf, filename: filenameOf(built.student, built.sourceLabel, check.finished_at ?? check.created_at), contentType: "application/pdf" },
      caption,
    );
    if (!res.ok) {
      console.error(`[writing-ai] telegram send failed: ${res.error}`);
      await stamp({ telegram_error: res.error.slice(0, 300) });
      return { ok: false, error: res.error };
    }
    await stamp({ telegram_sent_at: new Date().toISOString(), telegram_error: null });
    return { ok: true };
  } catch (e) {
    console.error("[writing-ai] deliverCheckPdf failed", e);
    const error = e instanceof Error ? e.message.slice(0, 300) : "unknown error";
    await stamp({ telegram_error: error }).catch(() => null);
    return { ok: false, error };
  }
}
