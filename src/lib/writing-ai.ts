import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { AxiomError, getEvaluationDetail, parseEvaluation, submitEvaluation, submitEvaluationWithImage } from "@/lib/axiom";
import { localDay } from "@/lib/day";
import { fileStore } from "@/lib/storage";
import { parseTask1, parseTask2 } from "@/lib/ielts/writing-prompt";
import { isPremiumActive } from "@/lib/premium";
import { countWords } from "@/lib/mock-shared";
import { createRateLimiter } from "@/lib/rate-limit";
import { getAttemptDetail } from "@/lib/mock";
import { getMyAttempt, type AttemptRow, type LibResult } from "@/lib/writing-practice";
import {
  MONTHLY_CHECKS,
  asResults,
  buildCriteria,
  monthKey,
  overallFromCriteria,
  parseBand,
  quotaOf,
  withoutBands,
  type AiTaskResult,
  type CheckQuota,
} from "@/lib/writing-ai-shared";

// AI writing checks (Axiom), migration 0063 — the engine for two features:
//   * PRACTICE: a premium student checks a SUBMITTED attempt, MONTHLY_CHECKS a
//     calendar month. A Full test is ONE check (both tasks); a lone Task 1 or
//     Task 2 attempt is one check each.
//   * MOCK: the owner runs a check on a submitted mock Writing. It is a private
//     draft: it never touches a student's quota, and the student only sees it
//     after release AND once the owner has switched it on — and then only the
//     words, never Axiom's numbers (withoutBands).
//
// Like src/lib/writing-practice.ts, the student-facing functions AUTHORISE
// THEMSELVES: they take the profile their caller read from the verified session
// and scope every query to it. The owner-facing ones (runMockCheck & co.) are
// authorisation-free by contract — their actions gate with assertAdmin().
//
// `writing_ai_checks` is not in the generated types until `npm run types` is
// next run with a Supabase access token, so this file talks to it through a
// loosely typed handle. DELETE `checks()` and use the typed client once the
// types are regenerated — an override that outlives its migration hides the
// real signature.

const checks = () => createAdminClient() as unknown as SupabaseClient;

/** Smallest essay worth spending a check on. */
export const MIN_WORDS_TO_CHECK = 30;

export type CheckStatus = "pending" | "done" | "failed";

export type CheckRow = {
  id: string;
  source: "practice" | "mock";
  user_id: string | null;
  practice_attempt_id: string | null;
  mock_attempt_id: string | null;
  month: string;
  status: CheckStatus;
  results: AiTaskResult[];
  show_to_student: boolean;
  error: string | null;
  telegram_sent_at: string | null;
  telegram_error: string | null;
  created_at: string;
  finished_at: string | null;
};

const CHECK_COLUMNS =
  "id, source, user_id, practice_attempt_id, mock_attempt_id, month, status, results, show_to_student, error, telegram_sent_at, telegram_error, created_at, finished_at";

function toCheck(row: Record<string, unknown>): CheckRow {
  return { ...(row as unknown as CheckRow), results: asResults(row.results) };
}

/** Five checks a minute per student is far beyond a human; it stops a script spending the quota. */
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

// ---------------------------------------------------------------- the engine

type TaskInput = {
  task: 1 | 2;
  /** The question, without the Cambridge boilerplate. */
  topic: string;
  body: string;
  image: { bytes: Uint8Array; ext: string } | null;
};

/** The question as Axiom should read it: no "You should spend about 20 minutes…" lines. */
function questionText(task: 1 | 2, raw: string | null | undefined): string {
  if (task === 1) return parseTask1(raw).topic.trim() || (raw ?? "").trim();
  const p = parseTask2(raw);
  return [p.statement, p.question].map((s) => s.trim()).filter(Boolean).join(" ") || (raw ?? "").trim();
}

/** Read a Task 1 picture from a private bucket; null if it is gone or unreadable. */
export async function readImage(bucket: string, path: string | null | undefined): Promise<{ bytes: Uint8Array; ext: string } | null> {
  if (!path) return null;
  try {
    const { data } = await fileStore(bucket, createAdminClient()).download(path);
    if (!data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const ext =
      bytes[0] === 0x89 && bytes[1] === 0x50 ? ".png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? ".jpg" : (path.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ".jpg");
    return { bytes, ext };
  } catch {
    return null;
  }
}

/** Send each task to Axiom (in parallel) and shape what comes back. Throws on any failure. */
async function evaluateTasks(tasks: TaskInput[]): Promise<AiTaskResult[]> {
  return Promise.all(
    tasks.map(async (t): Promise<AiTaskResult> => {
      const submitted =
        t.task === 1 && t.image
          ? await submitEvaluationWithImage({ topic: t.topic, body: t.body, image: t.image.bytes, imageExtension: t.image.ext })
          : await submitEvaluation({ task: t.task, topic: t.topic, body: t.body });
      if (!submitted.id || !submitted.evaluation) throw new AxiomError("Axiom returned no evaluation.", 502);
      const feedback = parseEvaluation(submitted.evaluation);
      if (!feedback) throw new AxiomError("Axiom returned feedback we could not read.", 502);
      const criteria = buildCriteria(t.task, feedback as Record<string, unknown>);
      if (criteria.every((c) => c.band == null)) throw new AxiomError("Axiom returned no scores.", 502);

      // The overall band is only in the detail call. If that call fails, the
      // check is still good: fall back to the mean of the four criteria.
      let overall: number | null = null;
      try {
        overall = parseBand((await getEvaluationDetail(submitted.id)).overall);
      } catch {
        overall = null;
      }
      return { task: t.task, axiomId: submitted.id, overall: overall ?? overallFromCriteria(criteria), criteria };
    }),
  );
}

/** A message a student can act on; the real error goes to the log. */
function friendly(e: unknown): string {
  if (e instanceof AxiomError && e.status === 503) return "The AI checker isn't set up yet. Nothing was used.";
  return "The AI checker couldn't finish this one. It did not use one of your checks — please try again in a minute.";
}

async function finish(id: string, patch: Record<string, unknown>): Promise<CheckRow | null> {
  const { data, error } = await checks()
    .from("writing_ai_checks")
    .update({ ...patch, finished_at: new Date().toISOString() })
    // Only a check still pending may be finished: one the 3-minute sweep has
    // already marked failed must not be revived by a late response.
    .eq("id", id)
    .eq("status", "pending")
    .select(CHECK_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toCheck(data) : null;
}

// ------------------------------------------------------------------ practice

export type PracticeProfile = {
  id: string;
  role: string;
  premium_until: string | null;
  timezone: string | null;
};

/** Premium members, and admins (who test it, uncounted). */
export function mayUseAiChecks(p: Pick<PracticeProfile, "role" | "premium_until">): boolean {
  return p.role === "admin" || isPremiumActive(p);
}

export async function practiceQuota(p: Pick<PracticeProfile, "id" | "timezone">): Promise<CheckQuota> {
  const month = monthKey(localDay(p.timezone));
  const { count, error } = await checks()
    .from("writing_ai_checks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", p.id)
    .eq("month", month)
    .eq("source", "practice")
    .in("status", ["pending", "done"]);
  if (error) throw new Error(error.message);
  return quotaOf(count ?? 0, month);
}

/** The tasks of a submitted attempt that are worth checking, in task order. */
function tasksOfAttempt(a: AttemptRow, image: TaskInput["image"]): TaskInput[] {
  const out: TaskInput[] = [];
  if (a.kind === "task2") {
    out.push({ task: 2, topic: questionText(2, a.prompt), body: a.answer, image: null });
  } else {
    out.push({ task: 1, topic: questionText(1, a.prompt), body: a.answer, image });
    if (a.kind === "full") out.push({ task: 2, topic: questionText(2, a.prompt2), body: a.answer2 ?? "", image: null });
  }
  return out.filter((t) => countWords(t.body) >= MIN_WORDS_TO_CHECK);
}

/** The student's latest live check for one attempt (pending or done), or null. */
export async function getPracticeCheck(userId: string, attemptId: string): Promise<CheckRow | null> {
  const { data, error } = await checks()
    .from("writing_ai_checks")
    .select(CHECK_COLUMNS)
    .eq("user_id", userId)
    .eq("practice_attempt_id", attemptId)
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toCheck(data) : null;
}

export async function runPracticeCheck(
  profile: PracticeProfile,
  attemptId: string,
): Promise<LibResult<{ check: CheckRow; quota: CheckQuota; fresh: boolean }>> {
  if (!mayUseAiChecks(profile)) return { ok: false, error: "AI checks are for Premium members." };
  if (!limiter.check(profile.id).allowed) return { ok: false, error: "Slow down a little — please wait a minute and try again." };

  // Scoped to this student: an attempt id from the browser is never trusted on its own.
  const attempt = await getMyAttempt(profile.id, attemptId);
  if (!attempt) return { ok: false, error: "That attempt wasn't found." };
  if (!attempt.submitted_at) return { ok: false, error: "Hand your writing in first, then check it." };

  const image = attempt.kind !== "task2" ? await readImage("writing-practice", attempt.image_path) : null;
  const tasks = tasksOfAttempt(attempt, image);
  if (!tasks.length) {
    return { ok: false, error: `There isn't enough to check yet — an answer needs at least ${MIN_WORDS_TO_CHECK} words.` };
  }

  const month = monthKey(localDay(profile.timezone));
  const { data: reserved, error: rpcError } = await checks().rpc("reserve_writing_check", {
    p_user: profile.id,
    p_attempt: attempt.id,
    p_month: month,
    // Admins are exempt: the limit is simply out of reach.
    p_limit: profile.role === "admin" ? 1_000_000 : MONTHLY_CHECKS,
  });
  if (rpcError) {
    console.error("[writing-ai] reserve failed", rpcError.message);
    return { ok: false, error: "Something went wrong. Nothing was used — please try again." };
  }
  const r = (reserved as { ok: boolean; reason: string | null; check_id: string | null }[])[0];

  if (!r.ok) {
    if (r.reason === "quota") {
      const q = quotaOf(MONTHLY_CHECKS, month);
      return { ok: false, error: `You've used all ${q.limit} AI checks for this month. They renew on ${q.renews}.` };
    }
    // 'already': a second click or tab. Show the same check rather than spend another.
    const existing = await getPracticeCheck(profile.id, attempt.id);
    if (existing?.status === "done") return { ok: true, check: existing, quota: await practiceQuota(profile), fresh: false };
    return { ok: false, error: "This is already being checked — give it a few seconds." };
  }

  const id = r.check_id as string;
  try {
    const results = await evaluateTasks(tasks);
    const check = await finish(id, { status: "done", results });
    if (!check) return { ok: false, error: "That took too long, so it was cancelled and didn't use one of your checks. Please try again." };
    return { ok: true, check, quota: await practiceQuota(profile), fresh: true };
  } catch (e) {
    console.error("[writing-ai] practice check failed", e);
    await finish(id, { status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "unknown" }).catch(() => null);
    return { ok: false, error: friendly(e) };
  }
}

// ---------------------------------------------------------------------- mock
//
// Owner-facing. No quota, no premium test: the owner decides who is checked.

export async function listMockChecks(mockAttemptId: string): Promise<CheckRow[]> {
  const { data, error } = await checks()
    .from("writing_ai_checks")
    .select(CHECK_COLUMNS)
    .eq("mock_attempt_id", mockAttemptId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toCheck);
}

export async function runMockCheck(mockAttemptId: string): Promise<LibResult<{ check: CheckRow }>> {
  const detail = await getAttemptDetail(mockAttemptId);
  if (!detail) return { ok: false, error: "That attempt wasn't found." };
  const a = detail.attempt;
  if (!a.writing_submitted_at) return { ok: false, error: "The student hasn't handed in the Writing yet." };

  const image = await readImage("mock-assets", a.writing_task1_image_path ?? detail.mock?.writing_task1_image_path);
  const tasks: TaskInput[] = [
    { task: 1 as const, topic: questionText(1, a.writing_task1_prompt), body: a.writing_task1 ?? "", image },
    { task: 2 as const, topic: questionText(2, a.writing_task2_prompt), body: a.writing_task2 ?? "", image: null },
  ].filter((t) => countWords(t.body) >= 1);
  if (!tasks.length) return { ok: false, error: "Both answers are empty, so there is nothing to check." };

  // One run at a time per attempt (a double click would otherwise spend Axiom twice).
  const running = (await listMockChecks(mockAttemptId)).find(
    (c) => c.status === "pending" && Date.now() - new Date(c.created_at).getTime() < 3 * 60_000,
  );
  if (running) return { ok: false, error: "A check is already running for this attempt." };

  const { data: row, error } = await checks()
    .from("writing_ai_checks")
    .insert({ source: "mock", user_id: a.user_id, mock_attempt_id: mockAttemptId, month: new Date().toISOString().slice(0, 7) })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[writing-ai] mock reserve failed", error?.message);
    return { ok: false, error: "Couldn't start the check. Nothing was changed." };
  }
  const id = (row as { id: string }).id;

  try {
    const check = await finish(id, { status: "done", results: await evaluateTasks(tasks) });
    if (!check) return { ok: false, error: "That took too long and was cancelled. Try again." };
    return { ok: true, check };
  } catch (e) {
    console.error("[writing-ai] mock check failed", e);
    await finish(id, { status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "unknown" }).catch(() => null);
    return { ok: false, error: e instanceof AxiomError && e.status === 503 ? "The AI checker isn't set up yet." : "Axiom couldn't finish this check. Try again." };
  }
}

/** Owner switch: may the student read Axiom's comments once the attempt is released? */
export async function setCheckVisible(checkId: string, visible: boolean): Promise<LibResult> {
  const { error } = await checks()
    .from("writing_ai_checks")
    .update({ show_to_student: visible })
    .eq("id", checkId)
    .eq("source", "mock")
    .eq("status", "done");
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * What a mock STUDENT may read: only for their own RELEASED attempt, only if the
 * owner switched it on, and with every number removed. This is the single door.
 */
export async function getStudentMockFeedback(userId: string, mockAttemptId: string): Promise<AiTaskResult[] | null> {
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("mock_attempts")
    .select("id")
    .eq("id", mockAttemptId)
    .eq("user_id", userId)
    .eq("status", "released")
    .maybeSingle();
  if (!attempt) return null;
  const { data } = await checks()
    .from("writing_ai_checks")
    .select("results")
    .eq("mock_attempt_id", mockAttemptId)
    .eq("status", "done")
    .eq("show_to_student", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const results = withoutBands(asResults((data as { results: unknown }).results));
  return results.length ? results : null;
}

/** One check by id (owner-side: the Telegram resend, the attempt page). */
export async function getCheck(checkId: string): Promise<CheckRow | null> {
  const { data, error } = await checks().from("writing_ai_checks").select(CHECK_COLUMNS).eq("id", checkId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toCheck(data) : null;
}
