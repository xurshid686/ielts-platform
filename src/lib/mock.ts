import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rows, type Json, type TablesUpdate } from "@/types/database";
import { rawToBand } from "@/lib/ielts/bandTable";
import { asAnswerKey, asAnswers, gradeAnswers, isAnswerCorrect } from "@/lib/ielts/grade";
import {
  MAX_ESSAY_CHARS,
  MAX_REQUEST_MESSAGE,
  nextSection,
  type MockAttemptStatus,
  type MockRequestStatus,
  applyIntegrityEvents,
  asIntegrity,
  recordReload,
  recordTimeout,
  type Integrity,
  type MockSection,
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

/** Shared with mock-admin.ts — the service-role client. */
export const db = () => createAdminClient();

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  listening_minutes: number;
  reading_minutes: number;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export const MOCK_COLS =
  "id, title, description, listening_test_id, reading_test_id, writing_task1_prompt, writing_task1_image_path, writing_task2_prompt, writing_minutes, listening_minutes, reading_minutes, published, created_at, updated_at";

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
  // 0051 snapshots — null only on attempts made before that migration.
  writing_minutes: number | null;
  writing_task1_image_path: string | null;
  listening_key: Json | null;
  reading_key: Json | null;
  // 0052 — server section clocks, drafts, integrity record.
  listening_started_at: string | null;
  reading_started_at: string | null;
  listening_minutes: number | null;
  reading_minutes: number | null;
  listening_draft: Json | null;
  reading_draft: Json | null;
  listening_audio_pos: number | null;
  integrity: Json;
};

export const ATTEMPT_COLS =
  "id, user_id, student_name, student_email, mock_id, request_id, status, approved_at, started_at, listening_test_id, reading_test_id, listening_answers, listening_raw, listening_total, listening_band, listening_submitted_at, reading_answers, reading_raw, reading_total, reading_band, reading_submitted_at, writing_task1_prompt, writing_task2_prompt, writing_task1, writing_task2, writing_started_at, writing_saved_at, writing_submitted_at, writing_task1_band, writing_task2_band, writing_band, writing_feedback, graded_at, overall_band, submitted_at, released_at, created_at, writing_minutes, writing_task1_image_path, listening_key, reading_key, listening_started_at, reading_started_at, listening_minutes, reading_minutes, listening_draft, reading_draft, listening_audio_pos, integrity";

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
export function num(v: unknown): number | null {
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

// ------------------------------------------------------- section lifecycle
//
// Every section has a SERVER clock (0052 for Listening/Reading, writing since
// 0050): stamped once when the section is first opened, minutes snapshotted at
// grant. A reload resumes the same clock — before 0052 a reload of Listening
// reloaded the CDI file, restarting its own timer and replaying the audio.
//
// RETURN, DO NOT RE-READ. The start functions run during a server render where
// Next memoizes identical GET fetches, so re-reading an attempt after writing
// to it returns the pre-write copy (see startWriting's history in CLAUDE.md).

/** Grace after a clock runs out, for a last autosave or submit in flight. */
export const SECTION_GRACE_MS = 60_000;

export function writingDeadline(startedAt: string | null, minutes: number): number | null {
  return startedAt ? new Date(startedAt).getTime() + minutes * 60_000 : null;
}

type PaperSection = "listening" | "reading";

const STARTED_COL = {
  listening: "listening_started_at",
  reading: "reading_started_at",
  writing: "writing_started_at",
} as const;

function sectionMinutes(a: AttemptRow, mock: MockRow | null, section: MockSection): number {
  if (section === "listening") return a.listening_minutes ?? mock?.listening_minutes ?? 40;
  if (section === "reading") return a.reading_minutes ?? mock?.reading_minutes ?? 60;
  return a.writing_minutes ?? mock?.writing_minutes ?? 60;
}

function isExpired(startedAt: string | null, minutes: number, now = Date.now()): boolean {
  const deadline = writingDeadline(startedAt, minutes);
  return deadline != null && now > deadline + SECTION_GRACE_MS;
}

/**
 * Applies `change` to an attempt's integrity record with COMPARE-AND-SET on
 * integrity_rev (0053). Several writers touch this record at once — the page
 * recording a reload, /api/mock-events, a second tab — and a plain
 * read-modify-write lost events in the E2E run. On a conflict it re-reads and
 * re-applies, up to 6 times.
 *
 * Each re-read uses a different filter (`neq integrity_rev -n`), because inside
 * a server render Next memoizes identical GETs and a repeated read would return
 * the same stale row forever.
 */
async function mutateIntegrity(attemptId: string, change: (current: Integrity) => Integrity): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const { data, error } = await db()
      .from("mock_attempts")
      .select("integrity, integrity_rev")
      .eq("id", attemptId)
      .neq("integrity_rev", -1 - i)
      .maybeSingle();
    if (error || !data) {
      console.error("[mock] integrity read failed", error?.message);
      return;
    }
    const row = data as { integrity: unknown; integrity_rev: number };
    const next = change(asIntegrity(row.integrity));
    const { data: written, error: wErr } = await db()
      .from("mock_attempts")
      .update({ integrity: next as unknown as Json, integrity_rev: row.integrity_rev + 1 })
      .eq("id", attemptId)
      .eq("integrity_rev", row.integrity_rev)
      .select("id");
    if (wErr) {
      console.error("[mock] integrity write failed", wErr.message);
      return;
    }
    if (written?.length) return;
  }
  console.error(`[mock] integrity write gave up after conflicts on ${attemptId}`);
}

export type SectionStart =
  | {
      ok: true;
      startedAt: string;
      minutes: number;
      reloaded: boolean;
      draft: Record<string, string>;
      audioPos: number;
      longAway: number;
    }
  | { ok: false; error: string };

/**
 * Opens (or re-opens) a Listening/Reading section. The first call stamps the
 * clock; any later call is a RELOAD, recorded server-side for the teacher —
 * the client cannot be trusted to report its own reload.
 */
export async function startSection(userId: string, mockId: string, section: PaperSection): Promise<SectionStart> {
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "You don't have a place on this mock." };
  if (nextSection(a) !== section) return { ok: false, error: "That section isn't open." };
  const mock = await getMock(mockId);
  const minutes = sectionMinutes(a, mock, section);
  const draft = asAnswers(section === "listening" ? a.listening_draft : a.reading_draft) ?? {};
  const audioPos = section === "listening" ? Number(a.listening_audio_pos ?? 0) || 0 : 0;
  const integrity = asIntegrity(a.integrity);
  const now = new Date().toISOString();
  const col = STARTED_COL[section];
  const already = section === "listening" ? a.listening_started_at : a.reading_started_at;

  if (already) {
    await mutateIntegrity(a.id, (cur) => recordReload(cur, section, now));
    return { ok: true, startedAt: already, minutes, reloaded: true, draft, audioPos, longAway: integrity.counters.long_away };
  }

  const { data, error } = await db()
    .from("mock_attempts")
    .update({
      [col]: now,
      status: "in_progress",
      started_at: a.started_at ?? now,
      // Snapshot the time limit with the start (0051 rule: the exam cannot change under them).
      ...(section === "listening" ? { listening_minutes: minutes } : { reading_minutes: minutes }),
    })
    .eq("id", a.id)
    .is(col, null)
    .select(col);
  if (error) return { ok: false, error: error.message };
  const stamped = (rows<Record<string, string>>(data)[0] ?? {})[col];
  if (stamped) {
    return { ok: true, startedAt: stamped, minutes, reloaded: false, draft, audioPos, longAway: integrity.counters.long_away };
  }
  // A concurrent render stamped it first; read with a query shape this render has not issued.
  const { data: fresh } = await db().from("mock_attempts").select(`${col}, status`).eq("id", a.id).maybeSingle();
  const started = (fresh as Record<string, string> | null)?.[col];
  return started
    ? { ok: true, startedAt: started, minutes, reloaded: true, draft, audioPos, longAway: integrity.counters.long_away }
    : { ok: false, error: "Couldn't start the section clock." };
}

/**
 * Autosave of a Listening/Reading section: the answers the page holds now and
 * how far the audio got. Refused once the clock (plus grace) has run out, so a
 * student cannot keep improving answers after time. `audio_pos` only moves
 * forward — it is what stops a reload from replaying the recording.
 */
export async function saveSectionDraft(
  userId: string,
  mockId: string,
  section: PaperSection,
  answersInput: unknown,
  audioPosInput: unknown,
): Promise<LibResult> {
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "You don't have a place on this mock." };
  if (nextSection(a) !== section) return { ok: false, error: "This section has already been submitted." };
  const startedAt = section === "listening" ? a.listening_started_at : a.reading_started_at;
  if (!startedAt) return { ok: false, error: "This section hasn't started." };
  if (isExpired(startedAt, sectionMinutes(a, null, section))) return { ok: false, error: "Time is up for this section." };

  const answers = asAnswers(answersInput) ?? {};
  const patch: TablesUpdate<"mock_attempts"> =
    section === "listening" ? { listening_draft: answers } : { reading_draft: answers };
  if (section === "listening") {
    const pos = Number(audioPosInput);
    const prev = Number(a.listening_audio_pos ?? 0) || 0;
    if (Number.isFinite(pos) && pos > prev && pos < 6 * 60 * 60) patch.listening_audio_pos = Math.round(pos * 10) / 10;
  }
  const { error } = await db()
    .from("mock_attempts")
    .update(patch)
    .eq("id", a.id)
    .is(section === "listening" ? "listening_submitted_at" : "reading_submitted_at", null);
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
 * The answers graded are the last server draft overlaid with what the page
 * submits. AFTER the clock (plus grace) only the draft counts — a late submit,
 * or a script posting answers after time, cannot add anything. A cleared answer
 * that was in the last draft survives the overlay; that trade is accepted.
 *
 * The update is conditional on `<section>_submitted_at is null`, so a double
 * submit (two tabs, a retry after a dropped connection) cannot overwrite the
 * first sitting's answers.
 */
export async function submitSection(
  userId: string,
  mockId: string,
  section: PaperSection,
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

  const { data: test } = await db().from("tests").select("answer_key").eq("id", testId).maybeSingle();
  const key = asAnswerKey((test as { answer_key?: unknown } | null)?.answer_key);
  if (!key) {
    return { ok: false, error: "This paper has no answer key, so it can't be marked. Tell your teacher." };
  }

  const startedAt = section === "listening" ? a.listening_started_at : a.reading_started_at;
  const draft = asAnswers(section === "listening" ? a.listening_draft : a.reading_draft) ?? {};
  const late = isExpired(startedAt, sectionMinutes(a, null, section));
  const answers = late ? draft : { ...draft, ...(asAnswers(answersInput) ?? {}) };

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
          // The key this section was marked against, so correcting the paper's
          // key later cannot re-mark a historical review (0051).
          listening_key: key,
        }
      : {
          reading_answers: answers,
          reading_raw: graded.raw,
          reading_total: graded.total,
          reading_band: band,
          reading_submitted_at: now,
          reading_key: key,
        };

  const { data: updated, error } = await db()
    .from("mock_attempts")
    .update({
      ...patch,
      status: "in_progress",
      started_at: a.started_at ?? now,
      // A section submitted without ever being opened (pre-0052 page) gets a start stamp now.
      ...(startedAt ? {} : { [STARTED_COL[section]]: now }),
    })
    .eq("id", a.id)
    .is(section === "listening" ? "listening_submitted_at" : "reading_submitted_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "This section has already been submitted." };
  if (late) await mutateIntegrity(a.id, (cur) => recordTimeout(cur, section, now));
  return { ok: true };
}

/**
 * Closes the current section if its clock has run out, from the saved draft.
 * Returns true when it changed something.
 *
 * ONE STEP PER REQUEST, and callers must redirect() when it returns true: it
 * runs during a page render, where Next memoizes identical GETs, so any read of
 * the attempt after this write in the same render sees the pre-write copy. A
 * redirect is a fresh request with a fresh memo, and if the next section's
 * clock has also expired the next render closes that one.
 */
export async function finalizeExpiredSection(userId: string, mockId: string): Promise<boolean> {
  // A select shape no other loader uses, so this read is never served from the memo.
  const { data } = await db()
    .from("mock_attempts")
    .select(`${ATTEMPT_COLS}, id`)
    .eq("user_id", userId)
    .eq("mock_id", mockId)
    .maybeSingle();
  const a = data as AttemptRow | null;
  if (!a || (a.status !== "approved" && a.status !== "in_progress")) return false;
  const section = nextSection(a);
  if (!section) return false;
  const mock = await getMock(mockId);
  if (!isExpired(a[STARTED_COL[section]], sectionMinutes(a, mock, section))) return false;

  const res =
    section === "writing"
      ? await saveWriting(userId, mockId, a.writing_task1 ?? "", a.writing_task2 ?? "", true)
      : await submitSection(userId, mockId, section, {});
  return res.ok;
}

/** Starts the writing clock the first time; a later visit is recorded as a reload. */
export async function startWriting(
  userId: string,
  mockId: string,
): Promise<{ ok: true; startedAt: string; reloaded: boolean; longAway: number } | { ok: false; error: string }> {
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "You don't have a place on this mock." };
  if (nextSection(a) !== "writing") return { ok: false, error: "Writing isn't open yet." };
  const integrity = asIntegrity(a.integrity);
  const now = new Date().toISOString();
  if (a.writing_started_at) {
    await mutateIntegrity(a.id, (cur) => recordReload(cur, "writing", now));
    return { ok: true, startedAt: a.writing_started_at, reloaded: true, longAway: integrity.counters.long_away };
  }

  const mock = await getMock(mockId);
  const { data, error } = await db()
    .from("mock_attempts")
    .update({
      writing_started_at: now,
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
  if (stamped) return { ok: true, startedAt: stamped, reloaded: false, longAway: integrity.counters.long_away };

  const { data: fresh } = await db()
    .from("mock_attempts")
    .select("writing_started_at, id")
    .eq("id", a.id)
    .maybeSingle();
  const started = (fresh as { writing_started_at: string | null } | null)?.writing_started_at;
  return started
    ? { ok: true, startedAt: started, reloaded: true, longAway: integrity.counters.long_away }
    : { ok: false, error: "Couldn't start the writing clock." };
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

  const minutes = a.writing_minutes ?? (await getMock(mockId))?.writing_minutes ?? 60;
  const expired = isExpired(a.writing_started_at, minutes);
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
  if (expired && handIn) await mutateIntegrity(a.id, (cur) => recordTimeout(cur, "writing", now));
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
    /** Snapshots (0051); null only on pre-0051 attempts, where the caller falls back to the mock. */
    writingMinutes: a.writing_minutes,
    task1ImagePath: a.writing_task1_image_path,
  };
}

/**
 * Folds browser-reported integrity events into the attempt (0052). Accepted
 * only for the student's own attempt while it is being sat, or within a few
 * minutes of handing in (the final batch flushes on page exit).
 */
export async function recordIntegrityEvents(userId: string, mockId: string, events: unknown): Promise<LibResult> {
  if (!Array.isArray(events) || events.length === 0) return { ok: true };
  const a = await loadAttempt(userId, mockId);
  if (!a) return { ok: false, error: "Not found." };
  const openish =
    a.status === "approved" ||
    a.status === "in_progress" ||
    (a.status === "submitted" && a.submitted_at && Date.now() - new Date(a.submitted_at).getTime() < 5 * 60_000);
  if (!openish) return { ok: false, error: "This attempt is closed." };
  const now = new Date().toISOString();
  await mutateIntegrity(a.id, (cur) => applyIntegrityEvents(cur, events, now));
  return { ok: true };
}

// ------------------------------------------------------- attempt breakdown
//
// Shared by the admin attempt page and a student's RELEASED result — the only
// two places a mock's correct answers reach a browser. Everything else admin-
// only lives in mock-admin.ts.

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

/**
 * Marks a section for display. Uses the key SNAPSHOTTED when the section was
 * graded (0051), so the breakdown always agrees with the band that was stored;
 * the live test key is only a fallback for pre-0051 attempts.
 */
async function reviewFor(
  testId: string | null,
  answers: Json | null,
  snapshotKey: Json | null,
  skill: "reading" | "listening",
): Promise<{ title: string | null; lines: ReviewLine[] }> {
  if (!testId) return { title: null, lines: [] };
  const { data } = await db().from("tests").select("title, answer_key").eq("id", testId).maybeSingle();
  const row = data as { title?: string; answer_key?: unknown } | null;
  const key = asAnswerKey(snapshotKey) ?? asAnswerKey(row?.answer_key);
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

export async function getAttemptDetail(attemptId: string): Promise<AttemptDetail | null> {
  if (!UUID.test(attemptId)) return null;
  const { data, error } = await db().from("mock_attempts").select(ATTEMPT_COLS).eq("id", attemptId).maybeSingle();
  if (error) throw new Error(`[mock] attempt load failed: ${error.message}`);
  const attempt = data as AttemptRow | null;
  if (!attempt) return null;

  const mock = await getMock(attempt.mock_id);
  const [listening, reading, image] = await Promise.all([
    attempt.listening_submitted_at
      ? reviewFor(attempt.listening_test_id, attempt.listening_answers, attempt.listening_key, "listening")
      : Promise.resolve({ title: null, lines: [] }),
    attempt.reading_submitted_at
      ? reviewFor(attempt.reading_test_id, attempt.reading_answers, attempt.reading_key, "reading")
      : Promise.resolve({ title: null, lines: [] }),
    signedTask1Image(attempt.writing_task1_image_path ?? mock?.writing_task1_image_path ?? null),
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

/** How many OTHER students still have this mock open (a place not yet handed in). */
export async function countStillSitting(mockId: string, excludeAttemptId?: string): Promise<number> {
  let q = db()
    .from("mock_attempts")
    .select("id", { count: "exact", head: true })
    .eq("mock_id", mockId)
    .in("status", ["approved", "in_progress"]);
  if (excludeAttemptId) q = q.neq("id", excludeAttemptId);
  const { count, error } = await q;
  if (error) throw new Error(`[mock] sitting count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * The student's released result with its breakdown. Null unless released.
 *
 * LEAK PROTECTION (0052): mocks are reused, so the per-question answers are
 * held back while anyone else still has this mock open — otherwise the first
 * student released can hand the key to the rest. Bands, raw marks and writing
 * feedback are shown regardless; only the correct answers wait.
 */
export async function getReleasedDetail(
  userId: string,
  mockId: string,
): Promise<(AttemptDetail & { reviewHeld: boolean }) | null> {
  const a = await loadAttempt(userId, mockId);
  if (!a || a.status !== "released") return null;
  const [detail, sitting] = await Promise.all([getAttemptDetail(a.id), countStillSitting(mockId, a.id)]);
  if (!detail) return null;
  if (sitting === 0) return { ...detail, reviewHeld: false };
  return { ...detail, listeningReview: [], readingReview: [], reviewHeld: true };
}
