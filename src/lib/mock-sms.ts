import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID } from "@/lib/mock";
import { EMAIL_BASE_URL } from "@/lib/email/send";
import { buildResultSms, normalizeUzPhone } from "@/lib/sms/format";
import { sendSms, smsConfigured, type SmsResult } from "@/lib/sms/send";

// Texting a released mock result (0071, owner 2026-11-24). The sibling of
// mock-email.ts and the ONLY door for it. The same rules hold:
//
//  - NOTHING HERE THROWS and nothing blocks a release. A failure is stamped on
//    the attempt (`result_sms_error`) for the panel, with a Send SMS again button.
//  - One SMS per release. The send is CLAIMED first by a conditional update
//    (`result_sms_sent_at is null`), so a double click, a bulk overlap or a
//    retried after() cannot pay for two. The provider's Idempotency-Key backs
//    that up. `force` is the owner's Send again; unreleasing clears the stamp.
//  - The phone is OPTIONAL. No number on the profile = quietly skipped.
//  - The link is https://mockonline.uz/a/<code>: a short random code that
//    downloads the released answers PDF without signing in (app/a/[code]).
//
// The 0071 columns are not in src/types/supabase.ts until `npm run types` is
// run with the owner's access token, so this talks through an untyped client,
// the stopgap lib/passes.ts uses. Use createAdminClient() once regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function db(): SupabaseClient<any, any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as unknown as SupabaseClient<any, any, any>;
}

/** How long the SMS link keeps working. After that the student signs in. */
export const REPORT_CODE_DAYS = 30;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 6 base62 characters from the CSPRNG (~5.7e10 codes; the route rate-limits guessing). */
export function newReportCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) {
    if (b >= 248) continue; // 248 = 4 * 62, keeps the draw uniform
    out += CODE_ALPHABET[b % 62];
    if (out.length === 6) return out;
  }
  return newReportCode();
}

type Row = {
  id: string;
  user_id: string | null;
  status: string;
  overall_band: number | null;
  listening_band: number | null;
  reading_band: number | null;
  writing_band: number | null;
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
  writing_submitted_at: string | null;
  result_sms_sent_at: string | null;
  report_code: string | null;
  report_code_expires_at: string | null;
};

const COLS =
  "id, user_id, status, overall_band, listening_band, reading_band, writing_band, listening_submitted_at, reading_submitted_at, writing_submitted_at, result_sms_sent_at, report_code, report_code_expires_at";

async function stamp(attemptId: string, patch: Record<string, unknown>) {
  const { error } = await db().from("mock_attempts").update(patch).eq("id", attemptId);
  if (error) console.error("[mock-sms] stamp failed", error.message);
}

/** The attempt's live code, or a fresh one (retried on the rare unique clash). */
async function ensureReportCode(a: Row): Promise<string> {
  if (a.report_code && a.report_code_expires_at && Date.parse(a.report_code_expires_at) > Date.now()) {
    return a.report_code;
  }
  const expires = new Date(Date.now() + REPORT_CODE_DAYS * 86_400_000).toISOString();
  for (let i = 0; i < 5; i++) {
    const code = newReportCode();
    const { error } = await db()
      .from("mock_attempts")
      .update({ report_code: code, report_code_expires_at: expires })
      .eq("id", a.id);
    if (!error) return code;
    if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error("Could not mint a report code.");
}

export type SmsOutcome = SmsResult & { skipped?: string };

/**
 * The released result, texted to the student's phone, if they gave one.
 * `force` re-sends one already sent (the owner's Send SMS again button).
 */
export async function smsMockResult(attemptId: string, force = false): Promise<SmsOutcome> {
  try {
    if (!UUID.test(attemptId)) return { sent: false, skipped: "That attempt no longer exists." };
    const { data } = await db().from("mock_attempts").select(COLS).eq("id", attemptId).maybeSingle();
    const a = data as Row | null;
    if (!a) return { sent: false, skipped: "That attempt no longer exists." };
    if (a.status !== "released") return { sent: false, skipped: "Not released yet." };
    if (a.overall_band == null) return { sent: false, skipped: "No overall band yet." };
    if (!a.user_id) return { sent: false, skipped: "The student's account was deleted." };

    const { data: prof } = await db().from("profiles").select("phone").eq("id", a.user_id).maybeSingle();
    const phone = normalizeUzPhone((prof as { phone?: string | null } | null)?.phone);
    if (!phone) return { sent: false, skipped: "The student gave no Uzbek phone number." };

    if (!smsConfigured()) {
      const error = "SMS isn't configured (no SMS_API_KEY).";
      await stamp(attemptId, { result_sms_error: error });
      return { sent: false, error };
    }

    // Claim the send. Without force, only the call that flips null -> now proceeds.
    const claimedAt = new Date().toISOString();
    let claim = db().from("mock_attempts").update({ result_sms_sent_at: claimedAt }).eq("id", attemptId);
    if (!force) claim = claim.is("result_sms_sent_at", null);
    const { data: claimed, error: claimErr } = await claim.select("id");
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed || claimed.length === 0) return { sent: false, skipped: "Already texted." };

    const code = await ensureReportCode(a);
    const text = buildResultSms({
      overall: Number(a.overall_band),
      listening: a.listening_submitted_at && a.listening_band != null ? Number(a.listening_band) : null,
      reading: a.reading_submitted_at && a.reading_band != null ? Number(a.reading_band) : null,
      writing: a.writing_submitted_at && a.writing_band != null ? Number(a.writing_band) : null,
      url: `${EMAIL_BASE_URL}/a/${code}`,
    });

    const res = await sendSms({
      phone,
      text,
      // A forced resend must be a new message; a normal one must not repeat.
      idempotencyKey: force ? `mock-result-${attemptId}-${Date.now()}` : `mock-result-${attemptId}`,
    });

    await stamp(
      attemptId,
      res.sent
        ? { result_sms_to: phone, result_sms_id: res.id ?? null, result_sms_error: null }
        : { result_sms_sent_at: null, result_sms_error: (res.error ?? "Unknown error").slice(0, 500) },
    );
    return res;
  } catch (e) {
    const error = e instanceof Error ? e.message : "SMS failed";
    console.error("[mock-sms] result", error);
    await stamp(attemptId, { result_sms_sent_at: null, result_sms_error: error.slice(0, 500) });
    return { sent: false, error };
  }
}

/** A bulk release, paced like the emails so the gateway is not flooded. */
export async function smsMockResults(attemptIds: string[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const [i, id] of attemptIds.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 600));
    const res = await smsMockResult(id);
    if (res.sent) sent++;
    else if (!res.skipped) failed++;
  }
  return { sent, failed };
}

/** A re-release should text again, and the old link must stop working. */
export async function clearResultSmsStamp(attemptId: string) {
  await stamp(attemptId, {
    result_sms_sent_at: null,
    result_sms_error: null,
    report_code: null,
    report_code_expires_at: null,
  });
}

export type SmsStatus = {
  sentAt: string | null;
  to: string | null;
  error: string | null;
};

/** For the admin attempt page. */
export async function getResultSmsStatus(attemptId: string): Promise<SmsStatus | null> {
  if (!UUID.test(attemptId)) return null;
  const { data } = await db()
    .from("mock_attempts")
    .select("result_sms_sent_at, result_sms_to, result_sms_error")
    .eq("id", attemptId)
    .maybeSingle();
  if (!data) return null;
  const d = data as { result_sms_sent_at: string | null; result_sms_to: string | null; result_sms_error: string | null };
  return { sentAt: d.result_sms_sent_at, to: d.result_sms_to, error: d.result_sms_error };
}

/** The signed-out download: the released attempt behind a live code, or why not. */
export async function attemptForReportCode(
  code: string,
): Promise<{ ok: true; attemptId: string } | { ok: false; expired: boolean; mockId?: string }> {
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return { ok: false, expired: false };
  const { data } = await db()
    .from("mock_attempts")
    .select("id, mock_id, status, report_code_expires_at")
    .eq("report_code", code)
    .maybeSingle();
  const a = data as { id: string; mock_id: string; status: string; report_code_expires_at: string | null } | null;
  if (!a || a.status !== "released") return { ok: false, expired: false };
  if (!a.report_code_expires_at || Date.parse(a.report_code_expires_at) <= Date.now()) {
    return { ok: false, expired: true, mockId: a.mock_id };
  }
  return { ok: true, attemptId: a.id };
}
