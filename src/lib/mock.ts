import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rows, type Json, type TablesUpdate } from "@/types/database";
import { rawToBand } from "@/lib/ielts/bandTable";
import { asAnswerKey, asAnswers, gradeAnswers, isAnswerCorrect } from "@/lib/ielts/grade";
import {
  MAX_ESSAY_CHARS,
  MAX_REQUEST_MESSAGE,
  isBand,
  nextSection,
  overallBand,
  writingBand,
  type MockAttemptStatus,
  type MockRequestStatus,
} from "@/lib/mock-shared";

// The Mock exam section (migration 0050), in one place.
//
// AUTHORISATION-FREE ON PURPOSE, and gated by its callers — the contract
// createTestFromHtml() and the reverted Cambridge library used: the server
// actions in app/actions/mock.ts establish WHO is asking (a verified session,
// or assertAdmin()), and the Telegram bot has already checked the owner's id.
// Do NOT call anything below from a place that has not gated.
//
// 0050 gives anon/authenticated NO grants on the mock tables, so this file is
// the only door to them, and it is where the rule that matters lives:
//
//   A STUDENT NEVER RECEIVES A SCORE, A RAW MARK OR A CORRECT ANSWER FOR AN
//   ATTEMPT THAT HAS NOT BEEN RELEASED.
//
// Every student-facing loader goes through toStudentAttempt(), which drops the
// score columns unless status = 'released'. Admin loaders are separate
// functions with separate return types, so a student page cannot pick up an
// admin shape by accident.

export type LibResult = { ok: true } | { ok: false; error: string };

const db = () => createAdminClient();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// -------------------------------------------------------------------- types

export type MockRow = {
  id: string;
  title: string;
  description: string | null;
  listening_test_id: string | null;
  reading_test_id: string | null;
  writing_task1_prompt: string | null;
  writing_task1_image_path: string | null;
  writing_task2_prompt: string | null;
  writing_minutes: number;
  published: boolean;
  created_at: string;
  updated_at: string;
};

const MOCK_COLS =
  "id, title, description, listening_test_id, reading_test_id, writing_task1_prompt, writing_task1_image_path, writing_task2_prompt, writing_minutes, published, created_at, updated_at";

export type AttemptRow = {
  id: string;
  user_id: string | null;
  student_name: string | null;
  student_email: string | null;
  mock_id: string;
  request_id: string | null;
  status: MockAttemptStatus;
  approved_at: string;
  started_at: string | null;
  listening_test_id: string | null;
  reading_test_id: string | null;
  listening_answers: Json | null;
  listening_raw: number | null;
  listening_total: number | null;
  listening_band: number | null;
  listening_submitted_at: string | null;
  reading_answers: Json | null;
  reading_raw: number | null;
  reading_total: number | null;
  reading_band: number | null;
  reading_submitted_at: string | null;
  writing_task1_prompt: string | null;
  writing_task2_prompt: string | null;
  writing_task1: string | null;
  writing_task2: string | null;
  writing_started_at: string | null;
  writing_saved_at: string | null;
  writing_submitted_at: string | null;
  writing_task1_band: number | null;
  writing_task2_band: number | null;
  writing_band: number | null;
  writing_feedback: string | null;
  graded_at: string | null;
  overall_band: number | null;
  submitted_at: string | null;
  released_at: string | null;
  created_at: string;
};

const ATTEMPT_COLS =
  "id, user_id, student_name, student_email, mock_id, request_id, status, approved_at, started_at, listening_test_id, reading_test_id, listening_answers, listening_raw, listening_total, listening_band, listening_submitted_at, reading_answers, reading_raw, reading_total, reading_band, reading_submitted_at, writing_task1_prompt, writing_task2_prompt, writing_task1, writing_task2, writing_started_at, writing_saved_at, writing_submitted_at, writing_task1_band, writing_task2_band, writing_band, writing_feedback, graded_at, overall_band, submitted_at, released_at, created_at";

export type RequestRow = {
  id: string;
  user_id: string;
  mock_id: string;
  status: MockRequestStatus;
  message: string | null;
  created_at: string;
  decided_at: string | null;
};

/** What a student may know about their own attempt. Scores only once released. */
export type StudentAttempt = {
  id: string;
  status: MockAttemptStatus;
  started_at: string | null;
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
  writing_started_at: string | null;
  writing_submitted_at: string | null;
  submitted_at: string | null;
  released_at: string | null;
  result: null | {
    listening: { raw: number | null; total: number | null; band: number | null };
    reading: { raw: number | null; total: number | null; band: number | null };
    writing: {
      task1: number | null;
      task2: number | null;
      band: number | null;
      feedback: string | null;
    };
    overall: number | null;
  };
};

function toStudentAttempt(a: AttemptRow): StudentAttempt {
  const released = a.status === "released";
  return {
    id: a.id,
    status: a.status,
    started_at: a.started_at,
    listening_submitted_at: a.listening_submitted_at,
    reading_submitted_at: a.reading_submitted_at,
    writing_started_at: a.writing_started_at,
    writing_submitted_at: a.writing_submitted_at,
    submitted_at: a.submitted_at,
    released_at: a.released_at,
    result: released
      ? {
          listening: { raw: a.listening_raw, total: a.listening_total, band: num(a.listening_band) },
          reading: { raw: a.reading_raw, total: a.reading_total, band: num(a.reading_band) },
          writing: {
            task1: num(a.writing_task1_band),
            task2: num(a.writing_task2_band),
            band: num(a.writing_band),
            feedback: a.writing_feedback,
          },
          overall: num(a.overall_band),
        }
      : null,
  };
}

/** numeric(3,1) arrives from PostgREST as a number, but be strict about it. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type StudentMockCard = {
  mock: { id: string; title: string; description: string | null };
  request: { status: MockRequestStatus; created_at: string } | null;
  attempt: StudentAttempt | null;
};

// ------------------------------------------------------------ student reads

async function loadAttempt(userId: string, mockId: string): Promise<AttemptRow | null> {
  const { data } = await db()
    .from("mock_attempts")
    .select(ATTEMPT_COLS)
    .eq("user_id", userId)
    .eq("mock_id", mockId)
    .maybeSingle();
  return (data as AttemptRow | null) ?? null;
}

export async function getMock(mockId: string): Promise<MockRow | null> {
  const { data } = await db().from("mocks").select(MOCK_COLS).eq("id", mockId).maybeSingle();
  return (data as MockRow | null) ?? null;
}

/**
 * The student's /mock page: every published mock, plus any mock they already
 * have an attempt on even if it was unpublished since — an exam record must not
 * vanish from the student's view because the owner tidied the list.
 */
export async function listMocksForStudent(userId: string): Promise<StudentMockCard[]> {
  const client = db();
  const [mocksRes, attemptsRes, requestsRes] = await Promise.all([
    client.from("mocks").select(MOCK_COLS).order("created_at", { ascending: false }),
    client.from("mock_attempts").select(ATTEMPT_COLS).eq("user_id", userId),
    client
      .from("mock_requests")
      .select("id, user_id, mock_id, status, message, created_at, decided_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const attempts = new Map(rows<AttemptRow>(attemptsRes.data).map((a) => [a.mock_id, a]));
  const latestRequest = new Map<string, RequestRow>();
  for (const r of rows<RequestRow>(requestsRes.data)) {
    if (!latestRequest.has(r.mock_id)) latestRequest.set(r.mock_id, r);
  }

  return rows<MockRow>(mocksRes.data)
    .filter((m) => m.published || attempts.has(m.id))
    .map((m) => {
      const a = attempts.get(m.id);
      const r = latestRequest.get(m.id);
      return {
        mock: { id: m.id, title: m.title, description: m.description },
        request: r ? { status: r.status, created_at: r.created_at } : null,
        attempt: a ? toStudentAttempt(a) : null,
      };
    });
}

/** The student's own attempt on one mock, score-stripped unless released. */
export async function getStudentAttempt(
  userId: string,
  mockId: string,
): Promise<{ mock: MockRow; attempt: StudentAttempt } | null> {
  const [mock, attempt] = await Promise.all([getMock(mockId), loadAttempt(userId, mockId)]);
  if (!mock || !attempt) return null;
  return { mock, attempt: toStudentAttempt(attempt) };
}

/**
 * THE CONTENT GATE for `track = 'mock'` papers, called from canOpenTrack().
 *
 * A student may open a mock paper only while it is the section they are
 * currently on: the listening paper until listening is submitted, the reading
 * paper after listening and until reading is submitted. Nothing before, nothing
 * after. That is what makes the attempt a single sitting — once submitted, the
 * paper is a 404 and cannot be retaken or re-read.
 */
export async function canOpenMockPaper(userId: string, testId: string): Promise<boolean> {
  // testId is interpolated into a PostgREST or() filter below; only a uuid may reach it.
  if (!UUID.test(testId)) return false;
  const { data } = await db()
    .from("mock_attempts")
    .select(
      "status, listening_test_id, reading_test_id, listening_submitted_at, reading_submitted_at, writing_submitted_at",
    )
    .eq("user_id", userId)
    .in("status", ["approved", "in_progress"])
    .or(`listening_test_id.eq.${testId},reading_test_id.eq.${testId}`);

  return rows<{
    listening_test_id: string | null;
    reading_test_id: string | null;
    listening_submitted_at: string | null;
    reading_submitted_at: string | null;
    writing_submitted_at: string | null;
  }>(data).some((a) => {
    const section = nextSection(a);
    return (
      (section === "listening" && a.listening_test_id === testId) ||
      (section === "reading" && a.reading_test_id === testId)
    );
  });
}

/** Is this test a paper in any mock? Used to refuse its key before release. */
export async function isMockPaper(testId: string): Promise<boolean> {
  const { data } = await db().from("tests").select("track").eq("id", testId).maybeSingle();
  return (data as { track?: string } | null)?.track === "mock";
}

/** A private Task 1 image, signed for a short while. */
export async function signedTask1Image(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db().storage.from("mock-assets").createSignedUrl(path, 60 * 60 * 3);
  return data?.signedUrl ?? null;
}

// ----------------------------------------------------------- student writes

export async function submitRequest(
  userId: string,
  mockId: string,
  message: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const mock = await getMock(mockId);
  if (!mock || !mock.published) return { ok: false, error: "That mock isn't available." };

  if (await loadAttempt(userId, mockId)) {
    return { ok: false, error: "You already have a place on this mock." };
  }

  const note = message.trim().slice(0, MAX_REQUEST_MESSAGE);
  const { data, error } = await db()
    .from("mock_requests")
    .insert({ user_id: userId, mock_id: mockId, message: note || null })
    .select("id")
    .single();

  if (error) {
    // mock_requests_one_pending: a second pending request for the same mock.
    if (error.code === "23505") {
      return { ok: false, error: "Your request is already waiting for approval." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/** First entry into the exam. Idempotent: re-entering an in-progress mock is fine. */
export async function startAttempt(userId: string, mockId: string): Promise<LibResult> {
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "You don't have a place on this mock." };
  if (a.status !== "approved") return { ok: true };

  const { error } = await db()
    .from("mock_attempts")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", a.id)
    .eq("status", "approved");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Grades and stores a listening or reading section.
 *
 * Grading is the same code saveResult() uses — gradeAnswers() against the
 * stored key, rawToBand() — so a mock band means what a practice band means.
 * What it deliberately does NOT do: write a `results` row (a student can read
 * those through PostgREST, which would leak the band before release), move the
 * rating, award XP or touch the streak. A mock is an exam, not practice.
 *
 * The update is conditional on `<section>_submitted_at is null`, so a double
 * submit (two tabs, a retry after a dropped connection) cannot overwrite the
 * first sitting's answers.
 */
export async function submitSection(
  userId: string,
  mockId: string,
  section: "listening" | "reading",
  answersInput: unknown,
): Promise<LibResult> {
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "You don't have a place on this mock." };
  if (a.status !== "approved" && a.status !== "in_progress") {
    return { ok: false, error: "This mock has already been submitted." };
  }
  if (nextSection(a) !== section) {
    return {
      ok: false,
      error:
        section === "listening" || a.reading_submitted_at
          ? "This section has already been submitted."
          : "Finish the Listening section first.",
    };
  }

  const testId = section === "listening" ? a.listening_test_id : a.reading_test_id;
  if (!testId) return { ok: false, error: "This mock has no paper for that section. Tell your teacher." };

  const { data: test } = await db()
    .from("tests")
    .select("answer_key")
    .eq("id", testId)
    .maybeSingle();
  const key = asAnswerKey((test as { answer_key?: unknown } | null)?.answer_key);
  if (!key) {
    return { ok: false, error: "This paper has no answer key, so it can't be marked. Tell your teacher." };
  }

  const answers = asAnswers(answersInput) ?? {};
  const graded = gradeAnswers(key, answers, section);
  const band = rawToBand(section, graded.raw, graded.total);
  const now = new Date().toISOString();

  const patch =
    section === "listening"
      ? {
          listening_answers: answers,
          listening_raw: graded.raw,
          listening_total: graded.total,
          listening_band: band,
          listening_submitted_at: now,
        }
      : {
          reading_answers: answers,
          reading_raw: graded.raw,
          reading_total: graded.total,
          reading_band: band,
          reading_submitted_at: now,
        };

  const { data: updated, error } = await db()
    .from("mock_attempts")
    .update({ ...patch, status: "in_progress", started_at: a.started_at ?? now })
    .eq("id", a.id)
    .is(section === "listening" ? "listening_submitted_at" : "reading_submitted_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "This section has already been submitted." };
  return { ok: true };
}

/** Grace after the writing clock runs out, for a last autosave in flight. */
const WRITING_GRACE_MS = 60_000;

export function writingDeadline(startedAt: string | null, minutes: number): number | null {
  return startedAt ? new Date(startedAt).getTime() + minutes * 60_000 : null;
}

/** Starts the writing clock the first time the student opens Writing. */
/**
 * Starts the writing clock the first time the student opens Writing, and
 * returns the clock's start time.
 *
 * RETURN THE TIMESTAMP, DO NOT RE-READ IT. This runs during a server render,
 * where Next memoizes identical GET fetches for the life of the render — and a
 * supabase-js select IS a GET. The section page has already loaded this
 * attempt once, so reading it again after the update hands back the SAME
 * pre-update response: no start time, so the page redirected every student to
 * the overview the first time they opened Writing (caught in the E2E run; a
 * reload worked, because by then the clock was already set). The PATCH below is
 * not memoized, so its `returning` row is the truth.
 */
export async function startWriting(
  userId: string,
  mockId: string,
): Promise<{ ok: true; startedAt: string } | { ok: false; error: string }> {
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "You don't have a place on this mock." };
  if (nextSection(a) !== "writing") return { ok: false, error: "Writing isn't open yet." };
  if (a.writing_started_at) return { ok: true, startedAt: a.writing_started_at };

  const mock = await getMock(mockId);
  const { data, error } = await db()
    .from("mock_attempts")
    .update({
      writing_started_at: new Date().toISOString(),
      // The prompts are copied now so a later edit to the mock cannot change
      // what this student is recorded as having answered.
      writing_task1_prompt: mock?.writing_task1_prompt ?? null,
      writing_task2_prompt: mock?.writing_task2_prompt ?? null,
    })
    .eq("id", a.id)
    .is("writing_started_at", null)
    .select("writing_started_at");
  if (error) return { ok: false, error: error.message };

  const stamped = rows<{ writing_started_at: string }>(data)[0]?.writing_started_at;
  if (stamped) return { ok: true, startedAt: stamped };

  // Zero rows: a concurrent render started the clock between our read and our
  // write. Read it with a query shape this render has not issued (so it cannot
  // be served from the memo).
  const { data: fresh } = await db()
    .from("mock_attempts")
    .select("writing_started_at, id")
    .eq("id", a.id)
    .maybeSingle();
  const started = (fresh as { writing_started_at: string | null } | null)?.writing_started_at;
  return started ? { ok: true, startedAt: started } : { ok: false, error: "Couldn't start the writing clock." };
}

export type WritingSaveResult =
  | { ok: true; submitted: boolean; savedAt: string }
  | { ok: false; error: string };

/**
 * Autosave (final = false) or hand in (final = true) the two essays.
 *
 * The clock is enforced here, not only in the browser: once the writing time
 * plus a short grace has passed, new text is refused and the draft already
 * saved is what gets handed in. A student who closes the tab and comes back
 * tomorrow cannot keep writing.
 */
export async function saveWriting(
  userId: string,
  mockId: string,
  task1: string,
  task2: string,
  final: boolean,
): Promise<WritingSaveResult> {
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "You don't have a place on this mock." };
  if (a.writing_submitted_at) return { ok: false, error: "Your writing has already been submitted." };
  if (nextSection(a) !== "writing" || !a.writing_started_at) {
    return { ok: false, error: "Writing isn't open yet." };
  }

  const mock = await getMock(mockId);
  const deadline = writingDeadline(a.writing_started_at, mock?.writing_minutes ?? 60)!;
  const expired = Date.now() > deadline + WRITING_GRACE_MS;
  const now = new Date().toISOString();

  const patch: TablesUpdate<"mock_attempts"> = {};
  if (!expired) {
    patch.writing_task1 = String(task1 ?? "").slice(0, MAX_ESSAY_CHARS);
    patch.writing_task2 = String(task2 ?? "").slice(0, MAX_ESSAY_CHARS);
    patch.writing_saved_at = now;
  }
  const handIn = final || expired;
  if (handIn) {
    patch.writing_submitted_at = now;
    patch.submitted_at = now;
    patch.status = "submitted";
  }

  const { data: updated, error } = await db()
    .from("mock_attempts")
    .update(patch)
    .eq("id", a.id)
    .is("writing_submitted_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "Your writing has already been submitted." };
  return { ok: true, submitted: handIn, savedAt: now };
}

/** What the writing page needs to resume: the drafts and the clock. */
export async function getWritingDraft(userId: string, mockId: string) {
  const a = await loadAttempt(userId, mockId);
  if (!a) return null;
  return {
    task1: a.writing_task1 ?? "",
    task2: a.writing_task2 ?? "",
    startedAt: a.writing_started_at,
    savedAt: a.writing_saved_at,
    task1Prompt: a.writing_task1_prompt,
    task2Prompt: a.writing_task2_prompt,
  };
}

// --------------------------------------------------------------- admin reads

export type AdminRequest = RequestRow & {
  name: string | null;
  email: string | null;
  mock_title: string;
};

export async function listRequests(): Promise<AdminRequest[]> {
  const client = db();
  const { data } = await client
    .from("mock_requests")
    .select("id, user_id, mock_id, status, message, created_at, decided_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const reqs = rows<RequestRow>(data);
  if (!reqs.length) return [];

  const [profs, mocks] = await Promise.all([
    client
      .from("profiles")
      .select("id, name, email")
      .in("id", [...new Set(reqs.map((r) => r.user_id))]),
    client
      .from("mocks")
      .select("id, title")
      .in("id", [...new Set(reqs.map((r) => r.mock_id))]),
  ]);
  const who = new Map(
    rows<{ id: string; name: string | null; email: string | null }>(profs.data).map((p) => [p.id, p]),
  );
  const title = new Map(rows<{ id: string; title: string }>(mocks.data).map((m) => [m.id, m.title]));

  return reqs.map((r) => ({
    ...r,
    name: who.get(r.user_id)?.name ?? null,
    email: who.get(r.user_id)?.email ?? null,
    mock_title: title.get(r.mock_id) ?? "(deleted mock)",
  }));
}

export async function countPendingRequests(): Promise<number> {
  const { count } = await db()
    .from("mock_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export type AdminMock = MockRow & {
  listening_title: string | null;
  reading_title: string | null;
  attempts: number;
};

export async function listMocksAdmin(): Promise<AdminMock[]> {
  const client = db();
  const [mocksRes, attemptsRes] = await Promise.all([
    client.from("mocks").select(MOCK_COLS).order("created_at", { ascending: false }),
    client.from("mock_attempts").select("mock_id"),
  ]);
  const mocks = rows<MockRow>(mocksRes.data);
  const ids = [
    ...new Set(mocks.flatMap((m) => [m.listening_test_id, m.reading_test_id]).filter(Boolean)),
  ] as string[];
  const titles = new Map<string, string>();
  if (ids.length) {
    const { data } = await client.from("tests").select("id, title").in("id", ids);
    for (const t of rows<{ id: string; title: string }>(data)) titles.set(t.id, t.title);
  }
  const counts = new Map<string, number>();
  for (const a of rows<{ mock_id: string }>(attemptsRes.data)) {
    counts.set(a.mock_id, (counts.get(a.mock_id) ?? 0) + 1);
  }
  return mocks.map((m) => ({
    ...m,
    listening_title: m.listening_test_id ? (titles.get(m.listening_test_id) ?? null) : null,
    reading_title: m.reading_test_id ? (titles.get(m.reading_test_id) ?? null) : null,
    attempts: counts.get(m.id) ?? 0,
  }));
}

export type MockPaper = { id: string; title: string; skill: "reading" | "listening"; total: number | null };

/** Papers an admin can put in a mock: everything uploaded on the Mock track. */
export async function listMockPapers(): Promise<MockPaper[]> {
  const { data } = await db()
    .from("tests")
    .select("id, title, skill, total")
    .eq("track", "mock")
    .order("created_at", { ascending: false });
  return rows<MockPaper>(data);
}

export type AdminAttemptSummary = Pick<
  AttemptRow,
  | "id"
  | "user_id"
  | "student_name"
  | "student_email"
  | "mock_id"
  | "status"
  | "approved_at"
  | "started_at"
  | "listening_band"
  | "reading_band"
  | "writing_band"
  | "overall_band"
  | "listening_submitted_at"
  | "reading_submitted_at"
  | "writing_submitted_at"
  | "submitted_at"
  | "released_at"
> & { mock_title: string };

/** Every attempt ever — the permanent record. No limit on purpose. */
export async function listAttemptsAdmin(): Promise<AdminAttemptSummary[]> {
  const client = db();
  const [attemptsRes, mocksRes] = await Promise.all([
    client
      .from("mock_attempts")
      .select(
        "id, user_id, student_name, student_email, mock_id, status, approved_at, started_at, listening_band, reading_band, writing_band, overall_band, listening_submitted_at, reading_submitted_at, writing_submitted_at, submitted_at, released_at",
      )
      .order("approved_at", { ascending: false }),
    client.from("mocks").select("id, title"),
  ]);
  const title = new Map(rows<{ id: string; title: string }>(mocksRes.data).map((m) => [m.id, m.title]));
  return rows<Omit<AdminAttemptSummary, "mock_title">>(attemptsRes.data).map((a) => ({
    ...a,
    listening_band: num(a.listening_band),
    reading_band: num(a.reading_band),
    writing_band: num(a.writing_band),
    overall_band: num(a.overall_band),
    mock_title: title.get(a.mock_id) ?? "(deleted mock)",
  }));
}

export type ReviewLine = { q: string; given: string; accepted: string[]; correct: boolean };

export type AttemptDetail = {
  attempt: AttemptRow;
  mock: MockRow | null;
  listeningTitle: string | null;
  readingTitle: string | null;
  listeningReview: ReviewLine[];
  readingReview: ReviewLine[];
  task1ImageUrl: string | null;
};

async function reviewFor(
  testId: string | null,
  answers: Json | null,
  skill: "reading" | "listening",
): Promise<{ title: string | null; lines: ReviewLine[] }> {
  if (!testId) return { title: null, lines: [] };
  const { data } = await db().from("tests").select("title, answer_key").eq("id", testId).maybeSingle();
  const row = data as { title?: string; answer_key?: unknown } | null;
  const key = asAnswerKey(row?.answer_key);
  const given = asAnswers(answers) ?? {};
  const lines = key
    ? Object.keys(key)
        .sort((x, y) => Number(x) - Number(y))
        .map((q) => ({
          q,
          given: given[q] ?? "",
          accepted: key[q],
          correct: isAnswerCorrect(key[q], given[q], skill),
        }))
    : [];
  return { title: row?.title ?? null, lines };
}

/** One attempt with the per-question breakdown. For admins, or a released student. */
export async function getAttemptDetail(attemptId: string): Promise<AttemptDetail | null> {
  const { data } = await db().from("mock_attempts").select(ATTEMPT_COLS).eq("id", attemptId).maybeSingle();
  const attempt = data as AttemptRow | null;
  if (!attempt) return null;

  const mock = await getMock(attempt.mock_id);
  const [listening, reading, image] = await Promise.all([
    attempt.listening_submitted_at
      ? reviewFor(attempt.listening_test_id, attempt.listening_answers, "listening")
      : Promise.resolve({ title: null, lines: [] }),
    attempt.reading_submitted_at
      ? reviewFor(attempt.reading_test_id, attempt.reading_answers, "reading")
      : Promise.resolve({ title: null, lines: [] }),
    signedTask1Image(mock?.writing_task1_image_path ?? null),
  ]);

  return {
    attempt: {
      ...attempt,
      listening_band: num(attempt.listening_band),
      reading_band: num(attempt.reading_band),
      writing_task1_band: num(attempt.writing_task1_band),
      writing_task2_band: num(attempt.writing_task2_band),
      writing_band: num(attempt.writing_band),
      overall_band: num(attempt.overall_band),
    },
    mock,
    listeningTitle: listening.title,
    readingTitle: reading.title,
    listeningReview: listening.lines,
    readingReview: reading.lines,
    task1ImageUrl: image,
  };
}

/** The student's released result with its breakdown. Null unless released. */
export async function getReleasedDetail(userId: string, mockId: string): Promise<AttemptDetail | null> {
  const a = await loadAttempt(userId, mockId);
  if (!a || a.status !== "released") return null;
  return getAttemptDetail(a.id);
}

// -------------------------------------------------------------- admin writes

export type MockInput = {
  id?: string;
  title: string;
  description: string | null;
  listening_test_id: string | null;
  reading_test_id: string | null;
  writing_task1_prompt: string | null;
  writing_task1_image_path?: string | null;
  writing_task2_prompt: string | null;
  writing_minutes: number;
  published: boolean;
};

export async function saveMock(input: MockInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the mock a title." };
  if (input.published) {
    if (!input.listening_test_id || !input.reading_test_id) {
      return { ok: false, error: "Pick both a Listening and a Reading paper before publishing." };
    }
    if (!input.writing_task1_prompt?.trim() || !input.writing_task2_prompt?.trim()) {
      return { ok: false, error: "Add both writing prompts before publishing." };
    }
  }
  const minutes = Math.round(Number(input.writing_minutes) || 60);
  if (minutes < 10 || minutes > 180) return { ok: false, error: "Writing time must be 10–180 minutes." };

  const row: TablesUpdate<"mocks"> = {
    title,
    description: input.description?.trim() || null,
    listening_test_id: input.listening_test_id || null,
    reading_test_id: input.reading_test_id || null,
    writing_task1_prompt: input.writing_task1_prompt?.trim() || null,
    writing_task2_prompt: input.writing_task2_prompt?.trim() || null,
    writing_minutes: minutes,
    published: input.published,
    updated_at: new Date().toISOString(),
  };
  if (input.writing_task1_image_path !== undefined) {
    row.writing_task1_image_path = input.writing_task1_image_path;
  }

  const client = db();
  if (input.id) {
    const { error } = await client.from("mocks").update(row).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: input.id };
  }
  const { data, error } = await client.from("mocks").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function uploadTask1Image(mockId: string, file: File): Promise<LibResult> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "Task 1 image must be an image file." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Keep the image under 5 MB." };
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${mockId}/task1-${Date.now()}.${ext}`;

  const client = db();
  const { error } = await client.storage
    .from("mock-assets")
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (error) return { ok: false, error: error.message };

  const { error: rowErr } = await client
    .from("mocks")
    .update({ writing_task1_image_path: path, updated_at: new Date().toISOString() })
    .eq("id", mockId);
  if (rowErr) return { ok: false, error: rowErr.message };
  return { ok: true };
}

/**
 * Deleting a mock is only allowed while nobody has an attempt on it — the
 * attempts are the permanent record (and 0050's `on delete restrict` would
 * refuse anyway). Unpublish it instead.
 */
export async function deleteMock(mockId: string): Promise<LibResult> {
  const { count } = await db()
    .from("mock_attempts")
    .select("id", { count: "exact", head: true })
    .eq("mock_id", mockId);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Students have sat this mock, so it is kept. Unpublish it instead." };
  }
  const { error } = await db().from("mocks").delete().eq("id", mockId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function createAttempt(
  userId: string,
  mockId: string,
  requestId: string | null,
  adminId: string | null,
): Promise<LibResult> {
  const client = db();
  const [mock, profRes] = await Promise.all([
    getMock(mockId),
    client.from("profiles").select("name, email").eq("id", userId).maybeSingle(),
  ]);
  if (!mock) return { ok: false, error: "That mock no longer exists." };
  if (!mock.listening_test_id || !mock.reading_test_id) {
    return { ok: false, error: "This mock is missing a Listening or Reading paper." };
  }
  const prof = (profRes.data as { name?: string | null; email?: string | null } | null) ?? {};

  const { error } = await client.from("mock_attempts").insert({
    user_id: userId,
    student_name: prof.name ?? null,
    student_email: prof.email ?? null,
    mock_id: mockId,
    request_id: requestId,
    approved_by: adminId,
    listening_test_id: mock.listening_test_id,
    reading_test_id: mock.reading_test_id,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That student already has a place on this mock." };
    return { ok: false, error: error.message };
  }

  const { error: noteErr } = await client.from("notifications").insert({
    user_id: userId,
    type: "mock_access",
    title: "Mock exam approved",
    body: `You can now sit "${mock.title}". Open the Mock section when you are ready — you get one attempt.`,
    data: { href: `/mock/${mockId}` },
  });
  if (noteErr) console.error("[mock] approval notification failed", noteErr.message);
  return { ok: true };
}

/**
 * Approve: create the attempt, stamp the request. One function so the web UI
 * and the Telegram bot cannot drift.
 */
export async function approveRequest(requestId: string, adminId: string | null): Promise<LibResult> {
  const client = db();
  const { data } = await client
    .from("mock_requests")
    .select("id, user_id, mock_id, status")
    .eq("id", requestId)
    .maybeSingle();
  const req = data as { id: string; user_id: string; mock_id: string; status: string } | null;
  if (!req) return { ok: false, error: "That request no longer exists." };
  if (req.status !== "pending") return { ok: false, error: `That request was already ${req.status}.` };

  const created = await createAttempt(req.user_id, req.mock_id, req.id, adminId);
  if (!created.ok) return created;

  await client
    .from("mock_requests")
    .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: adminId })
    .eq("id", req.id);
  return { ok: true };
}

export async function rejectRequest(requestId: string, adminId: string | null): Promise<LibResult> {
  const { data, error } = await db()
    .from("mock_requests")
    .update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: adminId })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "That request was already answered." };
  return { ok: true };
}

/** The owner giving a student a place directly, without a request. */
export async function grantByEmail(
  email: string,
  mockId: string,
  adminId: string | null,
): Promise<LibResult> {
  const { data } = await db().from("profiles").select("id").ilike("email", email.trim()).maybeSingle();
  const target = data as { id: string } | null;
  if (!target) return { ok: false, error: "No user found with that email." };
  return createAttempt(target.id, mockId, null, adminId);
}

/**
 * Withdraw a place that has not been used. Once a student has started, the
 * attempt is a record and stays.
 */
export async function cancelAttempt(attemptId: string): Promise<LibResult> {
  const { data, error } = await db()
    .from("mock_attempts")
    .delete()
    .eq("id", attemptId)
    .eq("status", "approved")
    .is("started_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "That student has already started, so the attempt is kept." };
  return { ok: true };
}

export async function gradeWriting(
  attemptId: string,
  input: { task1: number; task2: number; writing: number | null; feedback: string },
  adminId: string | null,
): Promise<LibResult> {
  if (!isBand(input.task1) || !isBand(input.task2)) {
    return { ok: false, error: "Task bands must be 0–9 in half steps." };
  }
  const writing = input.writing ?? writingBand(input.task1, input.task2);
  if (!isBand(writing)) return { ok: false, error: "Writing band must be 0–9 in half steps." };

  const client = db();
  const { data } = await client
    .from("mock_attempts")
    .select("status, listening_band, reading_band, writing_submitted_at")
    .eq("id", attemptId)
    .maybeSingle();
  const a = data as {
    status: string;
    listening_band: unknown;
    reading_band: unknown;
    writing_submitted_at: string | null;
  } | null;
  if (!a) return { ok: false, error: "That attempt no longer exists." };
  if (!a.writing_submitted_at) return { ok: false, error: "The student hasn't submitted their writing yet." };

  const overall = overallBand({
    listening: num(a.listening_band),
    reading: num(a.reading_band),
    writing,
  });

  const { error } = await client
    .from("mock_attempts")
    .update({
      writing_task1_band: input.task1,
      writing_task2_band: input.task2,
      writing_band: writing,
      writing_feedback: input.feedback.trim().slice(0, 5000) || null,
      overall_band: overall,
      graded_at: new Date().toISOString(),
      graded_by: adminId,
    })
    .eq("id", attemptId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Publish the result to the student. Requires a graded, fully submitted attempt. */
export async function releaseAttempt(attemptId: string, adminId: string | null): Promise<LibResult> {
  const client = db();
  const { data } = await client
    .from("mock_attempts")
    .select("user_id, mock_id, status, overall_band")
    .eq("id", attemptId)
    .maybeSingle();
  const a = data as { user_id: string | null; mock_id: string; status: string; overall_band: unknown } | null;
  if (!a) return { ok: false, error: "That attempt no longer exists." };
  if (a.status === "released") return { ok: false, error: "Already released." };
  if (a.status !== "submitted") return { ok: false, error: "The student hasn't finished the mock yet." };
  if (num(a.overall_band) == null) return { ok: false, error: "Grade the writing before releasing." };

  const { error } = await client
    .from("mock_attempts")
    .update({ status: "released", released_at: new Date().toISOString(), released_by: adminId })
    .eq("id", attemptId)
    .eq("status", "submitted");
  if (error) return { ok: false, error: error.message };

  if (a.user_id) {
    const { error: noteErr } = await client.from("notifications").insert({
      user_id: a.user_id,
      type: "mock_result",
      title: "Your mock exam result is ready",
      body: "Open the Mock section to see your bands and feedback.",
      data: { href: `/mock/${a.mock_id}/result` },
    });
    if (noteErr) console.error("[mock] release notification failed", noteErr.message);
  }
  return { ok: true };
}

/** Take a released result back (e.g. released by mistake). The record is untouched. */
export async function unreleaseAttempt(attemptId: string): Promise<LibResult> {
  const { data, error } = await db()
    .from("mock_attempts")
    .update({ status: "submitted", released_at: null, released_by: null })
    .eq("id", attemptId)
    .eq("status", "released")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "That result isn't released." };
  return { ok: true };
}
