import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rows, type TablesUpdate } from "@/types/database";
import { MAX_ESSAY_CHARS, countWords } from "@/lib/mock-shared";
import { isTopicId, type TopicId } from "@/lib/writing-practice-topics";

// Writing Task 2 practice (migration 0057), in one place.
//
// UNLIKE src/lib/mock.ts, THIS MODULE AUTHORISES ITSELF. mock.ts is
// authorisation-free by contract because the Telegram bot calls it with the
// owner's id already checked; nothing here has a second caller like that, and
// the service-role client bypasses RLS — so the ownership checks below ARE the
// security boundary. Every attempt function takes the user id its caller read
// from the VERIFIED session (requireProfile()), and every query is scoped to it.
// Do not add a function that trusts an attempt id on its own.
//
// What this feature deliberately does NOT have, because it is practice and not
// a mock: a band, a score, a release, a session window, an approval, a
// fullscreen guard, violations, and any consequence at all when the clock hits
// zero. The clock is advisory — see PRACTICE_MINUTES.

const db = () => createAdminClient();

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The advisory clock. The real exam allows 40 minutes for Task 2 and the screen
 * counts down from it, but NOTHING keys off it reaching zero: the student keeps
 * typing, keeps saving and submits when they are ready. (The mock's clock is
 * the opposite — server-enforced, with a hand-in at the deadline.)
 */
export const PRACTICE_MINUTES = 40;

export const PAGE_SIZE = 24;

export type LibResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type PracticeRow = {
  id: string;
  topic: TopicId;
  prompt: string;
  appearances: number;
  published: boolean;
  created_at: string;
};

export type AttemptRow = {
  id: string;
  user_id: string | null;
  practice_id: string;
  prompt: string;
  topic: TopicId;
  answer: string;
  word_count: number;
  revision: number;
  started_at: string;
  saved_at: string | null;
  submitted_at: string | null;
};

const PRACTICE_COLUMNS = "id, topic, prompt, appearances, published, created_at";
const ATTEMPT_COLUMNS =
  "id, user_id, practice_id, prompt, topic, answer, word_count, revision, started_at, saved_at, submitted_at";

// ------------------------------------------------------------------ catalogue

export type CatalogueEntry = PracticeRow & {
  /** How many times this student has finished it. Drives the "Practised" mark. */
  submissions: number;
  /** An unfinished attempt to resume, if there is one. */
  openAttemptId: string | null;
};

export type Catalogue = {
  entries: CatalogueEntry[];
  /** Published question counts per topic id — the filter chips' numbers. */
  counts: Record<string, number>;
  total: number;
  page: number;
  pages: number;
};

/**
 * The published library, most-asked first, with this student's own progress
 * folded in. An ordinary paginated server read: nothing is cached, because half
 * of what it returns is one student's private history.
 */
export async function loadCatalogue(
  userId: string,
  opts: { topic?: string | null; page?: number } = {},
): Promise<Catalogue> {
  const supabase = db();
  const topic = opts.topic && isTopicId(opts.topic) ? opts.topic : null;
  const page = Math.max(1, Math.floor(opts.page ?? 1));

  // Every published topic, for the chips. Small (606 rows at most), and it has
  // to be the WHOLE library rather than the current page.
  const { data: allTopics, error: countErr } = await supabase
    .from("writing_practice")
    .select("topic")
    .eq("published", true);
  if (countErr) throw new Error(countErr.message);

  const counts: Record<string, number> = {};
  for (const r of rows<{ topic: string }>(allTopics)) counts[r.topic] = (counts[r.topic] ?? 0) + 1;
  const total = topic ? (counts[topic] ?? 0) : rows<unknown>(allTopics).length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (Math.min(page, pages) - 1) * PAGE_SIZE;

  let q = supabase
    .from("writing_practice")
    .select(PRACTICE_COLUMNS)
    .eq("published", true)
    .order("appearances", { ascending: false })
    .order("created_at", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (topic) q = q.eq("topic", topic);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const entries = rows<PracticeRow>(data);

  // This student's attempts on exactly the questions on screen.
  const ids = entries.map((e) => e.id);
  const mine = ids.length
    ? rows<{ practice_id: string; id: string; submitted_at: string | null }>(
        (
          await supabase
            .from("writing_practice_attempts")
            .select("id, practice_id, submitted_at")
            .eq("user_id", userId)
            .in("practice_id", ids)
        ).data,
      )
    : [];

  const submissions = new Map<string, number>();
  const open = new Map<string, string>();
  for (const a of mine) {
    if (a.submitted_at) submissions.set(a.practice_id, (submissions.get(a.practice_id) ?? 0) + 1);
    else if (!open.has(a.practice_id)) open.set(a.practice_id, a.id);
  }

  return {
    entries: entries.map((e) => ({
      ...e,
      submissions: submissions.get(e.id) ?? 0,
      openAttemptId: open.get(e.id) ?? null,
    })),
    counts,
    total,
    page: Math.min(page, pages),
    pages,
  };
}

export async function getPractice(id: string): Promise<PracticeRow | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await db()
    .from("writing_practice")
    .select(PRACTICE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PracticeRow | null) ?? null;
}

// -------------------------------------------------------------------- sitting

/**
 * Opens the question: resumes the student's unfinished attempt on it, or starts
 * a new one, SNAPSHOTTING the prompt and topic as they are right now. Repeat
 * attempts are allowed — a second sitting is a second row.
 */
export async function openPractice(
  userId: string,
  practiceId: string,
): Promise<LibResult<{ attempt: AttemptRow }>> {
  const practice = await getPractice(practiceId);
  if (!practice || !practice.published) return { ok: false, error: "That practice question is not available." };

  const supabase = db();
  const { data: existing, error: readErr } = await supabase
    .from("writing_practice_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .is("submitted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) return { ok: true, attempt: existing as AttemptRow };

  const { data, error } = await supabase
    .from("writing_practice_attempts")
    .insert({ user_id: userId, practice_id: practiceId, prompt: practice.prompt, topic: practice.topic })
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, attempt: data as AttemptRow };
}

export type SaveResult = LibResult<{ revision: number; savedAt: string; submitted: boolean }>;

/**
 * One writer for the draft and the hand-in.
 *
 * - The attempt must be this student's — `user_id` is in the WHERE clause, not
 *   checked after the fact.
 * - `revision` is compare-and-set: a background tab holding older text gets a
 *   conflict instead of overwriting newer work. No second-tab block is needed;
 *   a message is enough for practice.
 * - `word_count` is counted HERE, never sent by the browser.
 * - Submitting is ATOMIC: text, count and submitted_at land in the same write,
 *   and a draft write afterwards is refused.
 */
export async function savePractice(
  userId: string,
  attemptId: string,
  answer: string,
  revision: number,
  final: boolean,
): Promise<SaveResult> {
  if (!UUID.test(attemptId)) return { ok: false, error: "Not found." };
  const text = String(answer ?? "").slice(0, MAX_ESSAY_CHARS);

  const supabase = db();
  const now = new Date().toISOString();
  const patch: TablesUpdate<"writing_practice_attempts"> = {
    answer: text,
    word_count: countWords(text),
    revision: revision + 1,
    saved_at: now,
    ...(final ? { submitted_at: now } : {}),
  };

  const { data, error } = await supabase
    .from("writing_practice_attempts")
    .update(patch)
    .eq("id", attemptId)
    .eq("user_id", userId)
    .eq("revision", revision)
    .is("submitted_at", null)
    .select("revision, saved_at, submitted_at")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!data) {
    // Nothing matched: it belongs to somebody else, it is already handed in, or
    // another tab saved first. Tell them apart so the screen can say what is true.
    const { data: row } = await supabase
      .from("writing_practice_attempts")
      .select("submitted_at")
      .eq("id", attemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Not found." };
    if ((row as { submitted_at: string | null }).submitted_at) {
      return { ok: false, error: "This practice has already been submitted." };
    }
    return { ok: false, error: "Saved somewhere else — reopen this practice to get the newest version." };
  }

  const saved = data as { revision: number; saved_at: string; submitted_at: string | null };
  return { ok: true, revision: saved.revision, savedAt: saved.saved_at, submitted: !!saved.submitted_at };
}

// -------------------------------------------------------------------- history

export async function listMyAttempts(userId: string, limit = 100): Promise<AttemptRow[]> {
  const { data, error } = await db()
    .from("writing_practice_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return rows<AttemptRow>(data);
}

/** One attempt, and only if it belongs to this student. */
export async function getMyAttempt(userId: string, attemptId: string): Promise<AttemptRow | null> {
  if (!UUID.test(attemptId)) return null;
  const { data, error } = await db()
    .from("writing_practice_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AttemptRow | null) ?? null;
}

// ---------------------------------------------------------------------- admin
//
// Separate functions with a separate shape, gated by requireAdmin() in the page
// — a student loader can never pick one of these up by accident.

export type AdminAttempt = AttemptRow & { student: string | null; email: string | null };

export async function listAttemptsForAdmin(opts: { limit?: number } = {}): Promise<AdminAttempt[]> {
  const supabase = db();
  const { data, error } = await supabase
    .from("writing_practice_attempts")
    .select(ATTEMPT_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) throw new Error(error.message);
  const attempts = rows<AttemptRow>(data);

  const ids = [...new Set(attempts.map((a) => a.user_id).filter((v): v is string => !!v))];
  const people = ids.length
    ? rows<{ id: string; name: string | null; email: string | null }>(
        (await supabase.from("profiles").select("id, name, email").in("id", ids)).data,
      )
    : [];
  const by = new Map(people.map((p) => [p.id, p]));

  return attempts.map((a) => ({
    ...a,
    student: (a.user_id && by.get(a.user_id)?.name) || null,
    email: (a.user_id && by.get(a.user_id)?.email) || null,
  }));
}

export async function getAttemptForAdmin(attemptId: string): Promise<AdminAttempt | null> {
  if (!UUID.test(attemptId)) return null;
  const supabase = db();
  const { data, error } = await supabase
    .from("writing_practice_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const attempt = (data as AttemptRow | null) ?? null;
  if (!attempt) return null;

  const person = attempt.user_id
    ? (await supabase.from("profiles").select("name, email").eq("id", attempt.user_id).maybeSingle()).data
    : null;
  const p = person as { name: string | null; email: string | null } | null;
  return { ...attempt, student: p?.name ?? null, email: p?.email ?? null };
}

export type AdminQuestion = PracticeRow & { attempts: number };

export async function listQuestionsForAdmin(topic?: string | null): Promise<AdminQuestion[]> {
  const supabase = db();
  let query = supabase
    .from("writing_practice")
    .select(PRACTICE_COLUMNS)
    .order("appearances", { ascending: false })
    .order("created_at", { ascending: true });
  if (topic && isTopicId(topic)) query = query.eq("topic", topic);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const questions = rows<PracticeRow>(data);

  const { data: counted } = await supabase.from("writing_practice_attempts").select("practice_id");
  const tally = new Map<string, number>();
  for (const r of rows<{ practice_id: string }>(counted)) {
    tally.set(r.practice_id, (tally.get(r.practice_id) ?? 0) + 1);
  }
  return questions.map((row) => ({ ...row, attempts: tally.get(row.id) ?? 0 }));
}

/** Publish or unpublish. A question is NEVER deleted — history points at it. */
export async function setPracticePublished(id: string, published: boolean): Promise<LibResult> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const { error } = await db()
    .from("writing_practice")
    .update({ published, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
