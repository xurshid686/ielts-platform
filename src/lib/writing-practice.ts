import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { rows, type TablesUpdate } from "@/types/database";
import { MAX_ESSAY_CHARS, countWords } from "@/lib/mock-shared";
import { isChartId, isTopicId, type ChartId, type TopicId } from "@/lib/writing-practice-topics";

// Writing practice (migrations 0057 + 0058), in one place: Task 1, Task 2 and
// the Full test (a Task 1 plus a random Task 2, in one sitting).
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
// zero. The clock is advisory — see minutesOf().

const db = () => createAdminClient();

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The three menus on /writing (0058). A question is task 1 or task 2; an
 * attempt is one of these kinds. "full" sits a TASK 1 question and carries the
 * Task 2 it was paired with in `practice2_id` / `prompt2` / `answer2`.
 */
export type PracticeKind = "task1" | "task2" | "full";
export const KINDS: readonly PracticeKind[] = ["task1", "task2", "full"];

export function isKind(value: unknown): value is PracticeKind {
  return value === "task1" || value === "task2" || value === "full";
}

/** Which questions a menu lists: Task 1 and Full both list charts. */
export function taskOfKind(kind: PracticeKind): 1 | 2 {
  return kind === "task2" ? 2 : 1;
}

/**
 * The advisory clock: the real exam's 20 / 40 / 60 minutes. The screen counts
 * down from it, but NOTHING keys off it reaching zero: the student keeps
 * typing, keeps saving and submits when they are ready. (The mock's clock is
 * the opposite — server-enforced, with a hand-in at the deadline.)
 */
export function minutesOf(kind: PracticeKind): number {
  return kind === "task1" ? 20 : kind === "task2" ? 40 : 60;
}

/** The private bucket holding Task 1 pictures (0058). Signed URLs only. */
const BUCKET = "writing-practice";

export const PAGE_SIZE = 24;

export type LibResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type PracticeRow = {
  id: string;
  /** Task 2 only. */
  topic: TopicId | null;
  prompt: string;
  appearances: number;
  published: boolean;
  created_at: string;
  task: 1 | 2;
  /** Task 1 only: the picture in the `writing-practice` bucket. */
  image_path: string | null;
  /** Task 1 only: what the picture is. */
  chart: ChartId | null;
};

export type AttemptRow = {
  id: string;
  user_id: string | null;
  practice_id: string;
  prompt: string;
  /** Task 2's topic or, for task1 / full, the chart kind — it drives the chip. */
  topic: string | null;
  answer: string;
  word_count: number;
  revision: number;
  started_at: string;
  saved_at: string | null;
  submitted_at: string | null;
  kind: PracticeKind;
  /** Snapshot of the Task 1 picture's path (task1 and full). */
  image_path: string | null;
  /** Full only: the Task 2 half. */
  practice2_id: string | null;
  prompt2: string | null;
  topic2: string | null;
  answer2: string;
  word_count2: number;
};

const PRACTICE_COLUMNS = "id, topic, prompt, appearances, published, created_at, task, image_path, chart";
// One literal, not a concatenation: supabase-js parses the select string's TYPE.
const ATTEMPT_COLUMNS =
  "id, user_id, practice_id, prompt, topic, answer, word_count, revision, started_at, saved_at, submitted_at, kind, image_path, practice2_id, prompt2, topic2, answer2, word_count2";

// ------------------------------------------------------------------ pictures

/** A Task 1 picture, signed for three hours (a long sitting plus a PDF). */
export async function signedPracticeImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 3);
  return data?.signedUrl ?? null;
}

async function signedPracticeImages(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return out;
  const { data } = await db().storage.from(BUCKET).createSignedUrls(unique, 60 * 60);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

// ------------------------------------------------------------------ catalogue

export type CatalogueEntry = PracticeRow & {
  /** How many times this student has finished it IN THIS MENU. Drives the "Done" mark. */
  submissions: number;
  /** An unfinished attempt of this kind to resume, if there is one. */
  openAttemptId: string | null;
  /** Task 1: a signed thumbnail URL. */
  imageUrl: string | null;
};

export type Catalogue = {
  entries: CatalogueEntry[];
  /** Published counts per topic id (Task 2) or chart kind (Task 1) — the chips' numbers. */
  counts: Record<string, number>;
  total: number;
  page: number;
  pages: number;
};

/**
 * One menu's published library, most-asked first (Task 2) or newest first
 * (Task 1), with this student's own progress folded in. An ordinary paginated
 * server read: nothing is cached, because half of what it returns is one
 * student's private history.
 */
export async function loadCatalogue(
  userId: string,
  opts: { kind?: PracticeKind; topic?: string | null; page?: number } = {},
): Promise<Catalogue> {
  const supabase = db();
  const kind = opts.kind ?? "task2";
  const task = taskOfKind(kind);
  // The filter is a topic in Task 2 and a chart kind in Task 1 / Full.
  const filter = task === 2 ? (isTopicId(opts.topic) ? opts.topic : null) : isChartId(opts.topic) ? opts.topic : null;
  const page = Math.max(1, Math.floor(opts.page ?? 1));

  // Every published question of this task, for the chips. Small, and it has to
  // be the WHOLE library rather than the current page. `task` MUST be filtered:
  // without it a chart lands in the Task 2 list.
  const { data: allRows, error: countErr } = await supabase
    .from("writing_practice")
    .select("topic, chart")
    .eq("published", true)
    .eq("task", task);
  if (countErr) throw new Error(countErr.message);

  const all = rows<{ topic: string | null; chart: string | null }>(allRows);
  const counts: Record<string, number> = {};
  for (const r of all) {
    const key = task === 2 ? r.topic : r.chart;
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = filter ? (counts[filter] ?? 0) : all.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (Math.min(page, pages) - 1) * PAGE_SIZE;

  let q = supabase
    .from("writing_practice")
    .select(PRACTICE_COLUMNS)
    .eq("published", true)
    .eq("task", task)
    .order("appearances", { ascending: false })
    .order("created_at", { ascending: task === 2 })
    .range(from, from + PAGE_SIZE - 1);
  if (filter) q = q.eq(task === 2 ? "topic" : "chart", filter);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const entries = rows<PracticeRow>(data);

  // This student's attempts of THIS kind on exactly the questions on screen.
  const ids = entries.map((e) => e.id);
  const mine = ids.length
    ? rows<{ practice_id: string; id: string; submitted_at: string | null }>(
        (
          await supabase
            .from("writing_practice_attempts")
            .select("id, practice_id, submitted_at")
            .eq("user_id", userId)
            .eq("kind", kind)
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

  const images = task === 1 ? await signedPracticeImages(entries.map((e) => e.image_path ?? "")) : new Map<string, string>();

  return {
    entries: entries.map((e) => ({
      ...e,
      submissions: submissions.get(e.id) ?? 0,
      openAttemptId: open.get(e.id) ?? null,
      imageUrl: (e.image_path && images.get(e.image_path)) || null,
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
 * Opens the question: resumes the student's unfinished attempt of this KIND on
 * it, or starts a new one, SNAPSHOTTING what they are shown right now. Repeat
 * attempts are allowed — a second sitting is a second row.
 *
 * A Full test opens a TASK 1 question and pairs it with a random published
 * Task 2 this student has not finished yet (any Task 2, once they have done
 * them all). The pair is made once, here, and kept on the attempt — a reload
 * resumes the same pair.
 */
export async function openPractice(
  userId: string,
  practiceId: string,
  kind: PracticeKind = "task2",
): Promise<LibResult<{ attempt: AttemptRow }>> {
  const practice = await getPractice(practiceId);
  if (!practice || !practice.published || practice.task !== taskOfKind(kind)) {
    return { ok: false, error: "That practice question is not available." };
  }

  const supabase = db();
  const { data: existing, error: readErr } = await supabase
    .from("writing_practice_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .eq("kind", kind)
    .is("submitted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) return { ok: true, attempt: existing as AttemptRow };

  let second: PracticeRow | null = null;
  if (kind === "full") {
    second = await pickTask2For(userId);
    if (!second) return { ok: false, error: "There are no Task 2 questions to pair with yet." };
  }

  const { data, error } = await supabase
    .from("writing_practice_attempts")
    .insert({
      user_id: userId,
      practice_id: practiceId,
      kind,
      prompt: practice.prompt,
      // Task 1 has no essay topic; its chart kind stands in, for the chip.
      topic: practice.task === 2 ? practice.topic : practice.chart,
      image_path: practice.image_path,
      ...(second ? { practice2_id: second.id, prompt2: second.prompt, topic2: second.topic } : {}),
    })
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, attempt: data as AttemptRow };
}

/** A random published Task 2, preferring ones this student has not finished. */
async function pickTask2For(userId: string): Promise<PracticeRow | null> {
  const supabase = db();
  const { data: pool, error } = await supabase
    .from("writing_practice")
    .select("id")
    .eq("published", true)
    .eq("task", 2);
  if (error) throw new Error(error.message);
  const ids = rows<{ id: string }>(pool).map((r) => r.id);
  if (!ids.length) return null;

  const { data: done, error: doneErr } = await supabase
    .from("writing_practice_attempts")
    .select("kind, practice_id, practice2_id")
    .eq("user_id", userId)
    .not("submitted_at", "is", null)
    .in("kind", ["task2", "full"]);
  if (doneErr) throw new Error(doneErr.message);
  const finished = new Set<string>();
  for (const a of rows<{ kind: string; practice_id: string; practice2_id: string | null }>(done)) {
    const id = a.kind === "full" ? a.practice2_id : a.practice_id;
    if (id) finished.add(id);
  }

  const fresh = ids.filter((id) => !finished.has(id));
  const from = fresh.length ? fresh : ids;
  return getPractice(from[Math.floor(Math.random() * from.length)]);
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
 * - Word counts are counted HERE, never sent by the browser.
 * - Submitting is ATOMIC: text, counts and submitted_at land in the same write,
 *   and a draft write afterwards is refused.
 * - `answer2` (the Task 2 half) is only ever written to a Full test.
 */
export async function savePractice(
  userId: string,
  attemptId: string,
  answer: string,
  revision: number,
  final: boolean,
  answer2?: string | null,
): Promise<SaveResult> {
  if (!UUID.test(attemptId)) return { ok: false, error: "Not found." };
  const text = String(answer ?? "").slice(0, MAX_ESSAY_CHARS);
  const text2 = answer2 == null ? null : String(answer2).slice(0, MAX_ESSAY_CHARS);

  const supabase = db();
  const now = new Date().toISOString();
  const patch: TablesUpdate<"writing_practice_attempts"> = {
    answer: text,
    word_count: countWords(text),
    ...(text2 != null ? { answer2: text2, word_count2: countWords(text2) } : {}),
    revision: revision + 1,
    saved_at: now,
    ...(final ? { submitted_at: now } : {}),
  };

  let update = supabase
    .from("writing_practice_attempts")
    .update(patch)
    .eq("id", attemptId)
    .eq("user_id", userId)
    .eq("revision", revision)
    .is("submitted_at", null);
  if (text2 != null) update = update.eq("kind", "full");
  const { data, error } = await update.select("revision, saved_at, submitted_at").maybeSingle();
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

export type AdminQuestion = PracticeRow & { attempts: number; imageUrl: string | null };

export async function listQuestionsForAdmin(topic?: string | null, task: 1 | 2 = 2): Promise<AdminQuestion[]> {
  const supabase = db();
  let query = supabase
    .from("writing_practice")
    .select(PRACTICE_COLUMNS)
    .eq("task", task)
    .order("appearances", { ascending: false })
    .order("created_at", { ascending: task === 2 });
  if (task === 2 && topic && isTopicId(topic)) query = query.eq("topic", topic);
  if (task === 1 && topic && isChartId(topic)) query = query.eq("chart", topic);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const questions = rows<PracticeRow>(data);

  // A Full test counts against both of its questions.
  const { data: counted } = await supabase.from("writing_practice_attempts").select("practice_id, practice2_id");
  const tally = new Map<string, number>();
  for (const r of rows<{ practice_id: string; practice2_id: string | null }>(counted)) {
    for (const id of [r.practice_id, r.practice2_id]) if (id) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  const images =
    task === 1 ? await signedPracticeImages(questions.map((q) => q.image_path ?? "")) : new Map<string, string>();
  return questions.map((row) => ({
    ...row,
    attempts: tally.get(row.id) ?? 0,
    imageUrl: (row.image_path && images.get(row.image_path)) || null,
  }));
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

/**
 * Adds a Task 1 question: the picture goes to the private bucket under a fresh
 * path, then the row goes in UNPUBLISHED — the owner publishes it from the list.
 *
 * `source_hash` covers the sentence AND the picture's bytes: two different
 * charts can share a stock sentence ("The graph below shows…"), and the same
 * upload sent twice should be refused, not duplicated.
 */
export async function createTask1Question(input: {
  prompt: string;
  chart: string;
  file: File | null;
}): Promise<LibResult<{ id: string }>> {
  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "Type the Task 1 sentence." };
  if (prompt.length > 2000) return { ok: false, error: "That sentence is too long." };
  if (!isChartId(input.chart)) return { ok: false, error: "Pick what kind of picture it is." };
  const file = input.file;
  if (!file || !file.size) return { ok: false, error: "Add the Task 1 picture." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "The picture must be an image file." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Keep the picture under 5 MB." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const normalised = prompt.normalize("NFC").replace(/\s+/g, " ").trim();
  const sourceHash = createHash("sha256")
    .update("task1\n")
    .update(normalised, "utf8")
    .update("\n")
    .update(bytes)
    .digest("hex");

  const supabase = db();
  const { data: dupe } = await supabase
    .from("writing_practice")
    .select("id")
    .eq("source_hash", sourceHash)
    .maybeSingle();
  if (dupe) return { ok: false, error: "This exact question is already in the library." };

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `task1/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { data, error } = await supabase
    .from("writing_practice")
    .insert({
      task: 1,
      topic: null,
      chart: input.chart,
      image_path: path,
      prompt,
      source_hash: sourceHash,
      appearances: 1,
      published: false,
    })
    .select("id")
    .single();
  if (error) {
    // Nothing points at the picture yet, so it is safe to take back.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as { id: string }).id };
}
