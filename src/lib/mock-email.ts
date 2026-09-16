import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rows, type TablesUpdate } from "@/types/database";
import { UUID } from "@/lib/mock";
import { buildAttemptReport } from "@/lib/mock-report";
import {
  EMAIL_BASE_URL,
  emailConfigured,
  sendMockReceiptEmail,
  sendMockResultEmail,
  type SendResult,
} from "@/lib/email/send";
import { tashkent } from "@/lib/mock-shared";

// Emailing a mock (0055, owner 2026-09-16). One module, so the rules live in one
// place and every caller gets the same behaviour:
//
//  - The student is emailed on RELEASE, with their results paper attached and
//    links to the result page and to the papers they sat.
//  - A receipt goes out when they finish, with no scores (nothing is marked yet).
//  - NOTHING HERE THROWS and nothing here blocks a release: a failure is stamped
//    on the attempt (`result_email_error`) for the panel to show, with a Send
//    again button. An email provider being down must never stop a result.
//  - Each email is sent once: `result_email_sent_at` / `receipt_email_sent_at`
//    guard it, so a bulk release re-run does not spam. `force` is the owner
//    clicking Send again, and unreleasing clears the stamp.
//  - EVERY send writes a row to `mock_messages` (0056), which is the log the
//    status bar reads: a retry adds a row rather than overwriting the last
//    outcome, and `provider_id` is how a delivery webhook finds it again. The
//    attempt keeps a denormalised copy of the latest RESULT status so the
//    Results list needs no join.

const db = () => createAdminClient();

/** Where the links point — see EMAIL_BASE_URL (one base for body and footer). */
const LINK_BASE = EMAIL_BASE_URL;

type Row = {
  id: string;
  student_name: string | null;
  student_email: string | null;
  status: string;
  mock_id: string;
  submitted_at: string | null;
  result_email_sent_at: string | null;
  receipt_email_sent_at: string | null;
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
};

const COLS =
  "id, student_name, student_email, status, mock_id, submitted_at, result_email_sent_at, receipt_email_sent_at, listening_submitted_at, reading_submitted_at";

async function load(attemptId: string): Promise<Row | null> {
  if (!UUID.test(attemptId)) return null;
  const { data } = await db().from("mock_attempts").select(COLS).eq("id", attemptId).maybeSingle();
  return (data as Row | null) ?? null;
}

async function stamp(attemptId: string, patch: TablesUpdate<"mock_attempts">) {
  const { error } = await db().from("mock_attempts").update(patch).eq("id", attemptId);
  if (error) console.error("[mock-email] stamp failed", error.message);
}

/** Opens a log row before the send, so an email that never returns is still on record. */
async function openMessage(
  a: { id: string; mock_id: string },
  kind: "result" | "receipt",
  to: string,
): Promise<string | null> {
  const { data, error } = await db()
    .from("mock_messages")
    .insert({ attempt_id: a.id, mock_id: a.mock_id, kind, to_email: to, status: "queued", attempts: 1 })
    .select("id")
    .single();
  if (error) {
    console.error("[mock-email] log insert failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/** Closes that row with what the provider said. */
async function closeMessage(messageId: string | null, res: SendResult) {
  if (!messageId) return;
  const now = new Date().toISOString();
  const { error } = await db()
    .from("mock_messages")
    .update(
      res.sent
        ? { status: "sent", provider_id: res.id ?? null, sent_at: now, error: null, updated_at: now }
        : { status: "failed", error: (res.error ?? "Unknown error").slice(0, 500), updated_at: now },
    )
    .eq("id", messageId);
  if (error) console.error("[mock-email] log update failed", error.message);
}

export type EmailOutcome = SendResult & { skipped?: string };

/**
 * The released result, emailed to the student with the PDF attached.
 * `force` re-sends one already sent (the owner's Send again button).
 */
export async function emailMockResult(attemptId: string, force = false): Promise<EmailOutcome> {
  try {
    const a = await load(attemptId);
    if (!a) return { sent: false, skipped: "That attempt no longer exists." };
    if (a.status !== "released") return { sent: false, skipped: "Not released yet." };
    if (!a.student_email) return { sent: false, skipped: "This attempt has no email address." };
    if (a.result_email_sent_at && !force) return { sent: false, skipped: "Already emailed." };
    if (!emailConfigured()) {
      const error = "Email isn't configured (no RESEND_API_KEY).";
      await stamp(attemptId, { result_email_error: error, result_email_status: "failed" });
      return { sent: false, error };
    }

    const built = await buildAttemptReport(attemptId, "pdf");
    if (!built) return { sent: false, skipped: "That attempt no longer exists." };
    const r = built.report;
    const messageId = await openMessage(a, "result", a.student_email);

    const reviewUrls = [
      a.listening_submitted_at ? { label: "Listening", url: `${LINK_BASE}/mock/${a.mock_id}/review/listening` } : null,
      a.reading_submitted_at ? { label: "Reading", url: `${LINK_BASE}/mock/${a.mock_id}/review/reading` } : null,
    ].filter((x): x is { label: string; url: string } => x !== null);

    const res = await sendMockResultEmail({
      to: a.student_email,
      name: a.student_name,
      mockTitle: r.mockTitle,
      overall: r.overall,
      bands: r.bands,
      feedback: r.feedback,
      resultUrl: `${LINK_BASE}/mock/${a.mock_id}/result`,
      reviewUrls,
      pdf: { filename: built.filename, content: built.data },
    });

    await closeMessage(messageId, res);
    await stamp(
      attemptId,
      res.sent
        ? {
            result_email_sent_at: new Date().toISOString(),
            result_email_to: a.student_email,
            result_email_error: null,
            result_email_status: "sent",
          }
        : { result_email_error: (res.error ?? "Unknown error").slice(0, 500), result_email_status: "failed" },
    );
    return res;
  } catch (e) {
    const error = e instanceof Error ? e.message : "Email failed";
    console.error("[mock-email] result", error);
    await stamp(attemptId, { result_email_error: error.slice(0, 500) });
    return { sent: false, error };
  }
}

/** "We have your mock" — sent once, when the student finishes. No scores. */
export async function emailMockReceipt(attemptId: string): Promise<EmailOutcome> {
  try {
    const a = await load(attemptId);
    if (!a) return { sent: false, skipped: "That attempt no longer exists." };
    if (!a.student_email) return { sent: false, skipped: "This attempt has no email address." };
    if (a.receipt_email_sent_at) return { sent: false, skipped: "Already emailed." };
    if (!emailConfigured()) return { sent: false, error: "Email isn't configured (no RESEND_API_KEY)." };

    const { data } = await db().from("mocks").select("title").eq("id", a.mock_id).maybeSingle();
    const messageId = await openMessage(a, "receipt", a.student_email);
    const res = await sendMockReceiptEmail({
      to: a.student_email,
      name: a.student_name,
      mockTitle: (data as { title?: string } | null)?.title ?? "mock exam",
      submittedAt: tashkent(a.submitted_at),
    });
    await closeMessage(messageId, res);
    if (res.sent) await stamp(attemptId, { receipt_email_sent_at: new Date().toISOString() });
    return res;
  } catch (e) {
    const error = e instanceof Error ? e.message : "Email failed";
    console.error("[mock-email] receipt", error);
    return { sent: false, error };
  }
}

/** Resend allows ~2 requests a second, so a bulk release paces itself. */
export async function emailMockResults(attemptIds: string[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const [i, id] of attemptIds.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    const res = await emailMockResult(id);
    if (res.sent) sent++;
    else if (!res.skipped) failed++;
  }
  return { sent, failed };
}

/** A re-release should email again (0055). Called when an attempt is unreleased. */
export async function clearResultEmailStamp(attemptId: string) {
  // The log rows stay: they are the history of what the student already received.
  await stamp(attemptId, { result_email_sent_at: null, result_email_error: null, result_email_status: null });
}

/**
 * The owner's "Retry failed" on the status bar: every released attempt of this
 * mock whose result email FAILED. A bounce or a complaint is deliberately not
 * retried — the address itself is wrong, so re-sending just fails again.
 */
export async function retryFailedResultEmails(mockId: string): Promise<{ sent: number; failed: number }> {
  if (!UUID.test(mockId)) return { sent: 0, failed: 0 };
  const { data } = await db()
    .from("mock_attempts")
    .select("id")
    .eq("mock_id", mockId)
    .eq("status", "released")
    .eq("result_email_status", "failed");
  const ids = rows<{ id: string }>(data).map((r) => r.id);
  let sent = 0;
  let failed = 0;
  for (const [i, id] of ids.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    const res = await emailMockResult(id, true);
    if (res.sent) sent++;
    else failed++;
  }
  return { sent, failed };
}
