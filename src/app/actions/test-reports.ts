"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanReport, categoryLabel, rateLimitError, REPORT_FIXED_XP, type ReportInput } from "@/lib/test-reports-shared";
import {
  closeReport,
  insertReport,
  markRewarded,
  unmarkRewarded,
  reopenReport,
  reportCounts,
  thankReporter,
} from "@/lib/test-reports";
import { notifyTestReport } from "@/lib/telegram/notify";
import { testPath } from "@/lib/tests/ref";
import { SITE_URL } from "@/lib/site";

export type ReportResult = { ok: true } | { ok: false; error: string };

// A signed-in student reports a problem in a test (0072). The session gives the
// user id; the test must exist; the text is re-validated with the dialog's rules.
export async function reportTestProblem(
  testId: string,
  input: ReportInput & { pageUrl?: string | null },
): Promise<ReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to report a problem." };

  const clean = cleanReport(input);
  if (!clean.ok) return clean;

  const admin = createAdminClient();
  const { data: test } = await admin.from("tests").select("id, title, skill, slug").eq("id", testId).maybeSingle();
  if (!test) return { ok: false, error: "We couldn't find this test." };

  const counts = await reportCounts(user.id, testId);
  const limited = rateLimitError(counts.today, counts.recentSameTest);
  if (limited) return { ok: false, error: limited };

  const ua = (await headers()).get("user-agent");
  const res = await insertReport({
    ...clean.value,
    testId,
    userId: user.id,
    pageUrl: input.pageUrl ?? null,
    userAgent: ua,
  });
  if (!res.ok) return { ok: false, error: "Could not send your report. Please try again." };

  after(async () => {
    const { data: prof } = await admin.from("profiles").select("name, email").eq("id", user.id).maybeSingle();
    const skill = test.skill === "listening" ? "listening" : "reading";
    await notifyTestReport({
      studentName: prof?.name || prof?.email || "A student",
      testTitle: test.title,
      skill: test.skill,
      category: categoryLabel(clean.value.category),
      question: clean.value.question,
      message: clean.value.message,
      testUrl: `${SITE_URL}${testPath(skill, test)}`,
      adminUrl: `${SITE_URL}/admin/reports`,
    });
  });
  revalidatePath("/admin/reports");
  return { ok: true };
}

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((data as { role?: string } | null)?.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, supabase, user };
}

export type ResolveResult =
  | { ok: true; rewarded: boolean; already: boolean }
  | { ok: false; error: string };

/**
 * Owner closes a report. "fixed" pays the student +50 XP and an in-app
 * thank-you, ONCE: the close is conditional on status='open' and the reward
 * on rewarded=false, so a double click or two admins cannot pay twice.
 * XP goes through the same gift_xp RPC as Admin → Members (admin session).
 */
export async function resolveReport(id: string, status: "fixed" | "dismissed"): Promise<ResolveResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const row = await closeReport(id, status, gate.user.id);
  if (!row) return { ok: true, rewarded: false, already: true };

  let rewarded = false;
  if (status === "fixed" && row.user_id && !row.rewarded && row.student?.email) {
    if (await markRewarded(id)) {
      const { error } = await gate.supabase.rpc("gift_xp", {
        target_email: row.student.email,
        amount: REPORT_FIXED_XP,
      });
      if (error) {
        console.error("[test-reports] gift_xp failed", error.message);
        await unmarkRewarded(id);
      } else {
        rewarded = true;
        const skill = row.test?.skill === "listening" ? "listening" : "reading";
        await thankReporter(row.user_id, row.test?.title ?? "a test", testPath(skill, { id: row.test_id }));
      }
    }
  }
  revalidatePath("/admin/reports");
  return { ok: true, rewarded, already: false };
}

export async function reopenTestReport(id: string): Promise<ReportResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  await reopenReport(id);
  revalidatePath("/admin/reports");
  return { ok: true };
}
