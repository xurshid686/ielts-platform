import "server-only";

import { rows, type TablesUpdate } from "@/types/database";
import { asAnswerKey } from "@/lib/ielts/grade";
import {
  ATTEMPT_COLS,
  MOCK_COLS,
  UUID,
  db,
  getMock,
  num,
  type AttemptRow,
  type LibResult,
  type MockRow,
  type RequestRow,
} from "@/lib/mock";
import {
  adminStage,
  asIntegrity,
  integrityVerdict,
  isBand,
  overallBand,
  writingBand,
  type AdminStage,
  type IntegrityVerdict,
} from "@/lib/mock-shared";

// The OWNER's side of the Mock exam section (0050/0051).
//
// Same contract as lib/mock.ts: service role, authorisation-free, gated by its
// callers — assertAdmin() in app/actions/mock.ts, requireAdmin() on the admin
// pages, the owner check in the Telegram webhook. Never import it from a
// student page.
//
// Two rules that came out of the 2026-09-15 review and are easy to regress:
//
//  - LOADERS NEVER TURN AN ERROR INTO AN EMPTY LIST. "Nothing pending" during a
//    database hiccup is how a request gets ignored for a week. They throw, and
//    the admin error boundary shows the failure.
//  - LOADERS FETCH EVERY ROW. PostgREST caps a response (1000 rows by default)
//    whether or not the query says .limit(), so "no limit" silently truncates
//    the permanent record. fetchAll() pages until a short page comes back.

const PAGE = 1000;

/** Pages a query builder to exhaustion. `build` must apply a stable order. */
async function fetchAll<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`[mock-admin] ${label} failed: ${error.message}`);
    const page = rows<T>(data);
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

function must<T>(label: string, res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[mock-admin] ${label} failed: ${res.error.message}`);
  return res.data;
}

// ------------------------------------------------------------------ requests

export type AdminRequest = RequestRow & {
  name: string | null;
  email: string | null;
  mock_title: string;
};

async function decorateRequests(reqs: RequestRow[]): Promise<AdminRequest[]> {
  if (!reqs.length) return [];
  const client = db();
  const [profs, mocks] = await Promise.all([
    client.from("profiles").select("id, name, email").in("id", [...new Set(reqs.map((r) => r.user_id))]),
    client.from("mocks").select("id, title").in("id", [...new Set(reqs.map((r) => r.mock_id))]),
  ]);
  const who = new Map(
    rows<{ id: string; name: string | null; email: string | null }>(must("profiles", profs)).map((p) => [p.id, p]),
  );
  const title = new Map(rows<{ id: string; title: string }>(must("mocks", mocks)).map((m) => [m.id, m.title]));
  return reqs.map((r) => ({
    ...r,
    name: who.get(r.user_id)?.name ?? null,
    email: who.get(r.user_id)?.email ?? null,
    mock_title: title.get(r.mock_id) ?? "(deleted mock)",
  }));
}

const REQUEST_COLS = "id, user_id, mock_id, status, message, created_at, decided_at";

/** EVERY pending request, oldest first — the queue. Never capped. */
export async function listPendingRequests(): Promise<AdminRequest[]> {
  const reqs = await fetchAll<RequestRow>("pending requests", (from, to) =>
    db()
      .from("mock_requests")
      .select(REQUEST_COLS)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return decorateRequests(reqs);
}

/** Recently answered requests, for context. Deliberately capped — it is history, not a queue. */
export async function listRecentDecisions(limit = 50): Promise<AdminRequest[]> {
  const { data, error } = await db()
    .from("mock_requests")
    .select(REQUEST_COLS)
    .neq("status", "pending")
    .order("decided_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`[mock-admin] decisions failed: ${error.message}`);
  return decorateRequests(rows<RequestRow>(data));
}

export async function countPendingRequests(): Promise<number> {
  const { count, error } = await db()
    .from("mock_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(`[mock-admin] pending count failed: ${error.message}`);
  return count ?? 0;
}

/** Overview workload numbers for /admin. */
export async function workloadCounts(): Promise<{ pending: number; needsGrading: number; readyToRelease: number }> {
  const [pending, attempts] = await Promise.all([
    countPendingRequests(),
    fetchAll<{ status: string; writing_band: number | null; overall_band: number | null }>("submitted", (from, to) =>
      db()
        .from("mock_attempts")
        .select("status, writing_band, overall_band, id")
        .eq("status", "submitted")
        .order("id")
        .range(from, to),
    ),
  ]);
  const ready = attempts.filter((a) => num(a.writing_band) != null && num(a.overall_band) != null).length;
  return { pending, needsGrading: attempts.length - ready, readyToRelease: ready };
}

// --------------------------------------------------------------------- mocks

export type MockPaper = {
  id: string;
  title: string;
  skill: "reading" | "listening";
  total: number | null;
  track: string;
  hasKey: boolean;
};

async function loadPapers(ids?: string[]): Promise<MockPaper[]> {
  const list = await fetchAll<{ id: string; title: string; skill: "reading" | "listening"; total: number | null; track: string; answer_key: unknown }>(
    "papers",
    (from, to) => {
      let q = db().from("tests").select("id, title, skill, total, track, answer_key").order("id").range(from, to);
      q = ids ? q.in("id", ids) : q.eq("track", "mock");
      return q;
    },
  );
  return list.map(({ answer_key, ...t }) => ({ ...t, hasKey: !!asAnswerKey(answer_key) }));
}

/** Papers an admin can put in a mock: everything uploaded on the Mock track. */
export async function listMockPapers(): Promise<MockPaper[]> {
  return (await loadPapers()).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * What stops this mock being sat, in the owner's words. Empty = ready.
 *
 * ONE validator for publish, approve and direct grant, so an incomplete mock
 * cannot reach a student by any door — the review found drafts could be
 * granted and a keyless paper was only discovered when a student submitted.
 */
function readinessIssues(
  mock: Pick<
    MockRow,
    | "listening_test_id"
    | "reading_test_id"
    | "writing_task1_prompt"
    | "writing_task2_prompt"
    | "writing_minutes"
    | "listening_minutes"
    | "reading_minutes"
  >,
  papers: Map<string, MockPaper>,
): string[] {
  const issues: string[] = [];
  const check = (id: string | null, skill: "listening" | "reading", label: string) => {
    if (!id) return issues.push(`Pick a ${label} paper.`);
    const p = papers.get(id);
    if (!p) return issues.push(`The ${label} paper no longer exists.`);
    if (p.skill !== skill) return issues.push(`The ${label} paper is a ${p.skill} test.`);
    if (p.track !== "mock") return issues.push(`The ${label} paper is not on the Mock track, so it is public.`);
    if (!p.hasKey) return issues.push(`The ${label} paper has no answer key, so it cannot be marked.`);
  };
  check(mock.listening_test_id, "listening", "Listening");
  check(mock.reading_test_id, "reading", "Reading");
  if (!mock.writing_task1_prompt?.trim()) issues.push("Add the Writing Task 1 prompt.");
  if (!mock.writing_task2_prompt?.trim()) issues.push("Add the Writing Task 2 prompt.");
  const inRange = (m: number) => m >= 10 && m <= 180;
  if (!inRange(mock.listening_minutes)) issues.push("Listening time must be 10–180 minutes.");
  if (!inRange(mock.reading_minutes)) issues.push("Reading time must be 10–180 minutes.");
  if (!inRange(mock.writing_minutes)) issues.push("Writing time must be 10–180 minutes.");
  return issues;
}

async function issuesFor(mock: MockRow): Promise<string[]> {
  const ids = [mock.listening_test_id, mock.reading_test_id].filter(Boolean) as string[];
  const papers = new Map((ids.length ? await loadPapers(ids) : []).map((p) => [p.id, p]));
  return readinessIssues(mock, papers);
}

export type AdminMock = MockRow & {
  listening_title: string | null;
  reading_title: string | null;
  issues: string[];
  /** Places exist, so papers, prompts, timing and image are locked. */
  locked: boolean;
  counts: Record<AdminStage, number> & { total: number; pending: number };
};

const emptyCounts = (): AdminMock["counts"] => ({
  total: 0,
  pending: 0,
  not_started: 0,
  listening: 0,
  reading: 0,
  writing: 0,
  needs_grading: 0,
  ready_to_release: 0,
  released: 0,
});

export async function listMocksAdmin(): Promise<AdminMock[]> {
  const [mocks, attempts, pending] = await Promise.all([
    fetchAll<MockRow>("mocks", (from, to) =>
      db().from("mocks").select(MOCK_COLS).order("created_at", { ascending: false }).order("id").range(from, to),
    ),
    fetchAll<AdminAttemptRowLite>("attempt stages", (from, to) =>
      db().from("mock_attempts").select(STAGE_COLS).order("id").range(from, to),
    ),
    fetchAll<{ mock_id: string }>("pending by mock", (from, to) =>
      db().from("mock_requests").select("mock_id, id").eq("status", "pending").order("id").range(from, to),
    ),
  ]);

  const ids = [...new Set(mocks.flatMap((m) => [m.listening_test_id, m.reading_test_id]).filter(Boolean))] as string[];
  const papers = new Map((ids.length ? await loadPapers(ids) : []).map((p) => [p.id, p]));

  const counts = new Map<string, AdminMock["counts"]>();
  const bump = (id: string) => {
    if (!counts.has(id)) counts.set(id, emptyCounts());
    return counts.get(id)!;
  };
  for (const a of attempts) {
    const c = bump(a.mock_id);
    c.total++;
    c[adminStage(liteStage(a))]++;
  }
  for (const r of pending) bump(r.mock_id).pending++;

  return mocks.map((m) => {
    const c = counts.get(m.id) ?? emptyCounts();
    return {
      ...m,
      listening_title: m.listening_test_id ? (papers.get(m.listening_test_id)?.title ?? null) : null,
      reading_title: m.reading_test_id ? (papers.get(m.reading_test_id)?.title ?? null) : null,
      issues: readinessIssues(m, papers),
      locked: c.total > 0,
      counts: c,
    };
  });
}

// ------------------------------------------------------------------ attempts

const STAGE_COLS =
  "id, mock_id, status, started_at, listening_submitted_at, reading_submitted_at, writing_submitted_at, writing_band, overall_band";

type AdminAttemptRowLite = {
  id: string;
  mock_id: string;
  status: string;
  started_at: string | null;
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
  writing_submitted_at: string | null;
  writing_band: unknown;
  overall_band: unknown;
};

function liteStage(a: AdminAttemptRowLite) {
  return { ...a, writing_band: num(a.writing_band), overall_band: num(a.overall_band) };
}

export type AdminAttemptSummary = {
  id: string;
  user_id: string | null;
  student_name: string | null;
  student_email: string | null;
  mock_id: string;
  mock_title: string;
  status: string;
  stage: AdminStage;
  approved_at: string;
  started_at: string | null;
  listening_submitted_at: string | null;
  reading_submitted_at: string | null;
  writing_started_at: string | null;
  writing_saved_at: string | null;
  writing_submitted_at: string | null;
  submitted_at: string | null;
  released_at: string | null;
  listening_band: number | null;
  reading_band: number | null;
  writing_band: number | null;
  overall_band: number | null;
  /** 0052 — evidence for the teacher, never acted on automatically. */
  integrity: IntegrityVerdict;
};

const SUMMARY_COLS =
  "id, user_id, student_name, student_email, mock_id, status, approved_at, started_at, listening_submitted_at, reading_submitted_at, writing_started_at, writing_saved_at, writing_submitted_at, submitted_at, released_at, listening_band, reading_band, writing_band, overall_band, listening_started_at, reading_started_at, listening_minutes, reading_minutes, integrity";

type SummaryRow = Omit<AdminAttemptSummary, "mock_title" | "stage" | "integrity"> & {
  listening_started_at: string | null;
  reading_started_at: string | null;
  listening_minutes: number | null;
  reading_minutes: number | null;
  integrity: unknown;
};

/** The integrity verdict for an attempt row that carries the 0052 columns. */
export function verdictFor(a: {
  integrity: unknown;
  listening_started_at: string | null;
  listening_submitted_at: string | null;
  listening_minutes: number | null;
  reading_started_at: string | null;
  reading_submitted_at: string | null;
  reading_minutes: number | null;
}): IntegrityVerdict {
  return integrityVerdict(asIntegrity(a.integrity), [
    { section: "listening", startedAt: a.listening_started_at, submittedAt: a.listening_submitted_at, minutes: a.listening_minutes },
    { section: "reading", startedAt: a.reading_started_at, submittedAt: a.reading_submitted_at, minutes: a.reading_minutes },
  ]);
}

/** EVERY attempt ever — the permanent record — paged to exhaustion. */
export async function listAttemptsAdmin(): Promise<AdminAttemptSummary[]> {
  const [list, mocks] = await Promise.all([
    fetchAll<SummaryRow>("attempts", (from, to) =>
      db()
        .from("mock_attempts")
        .select(SUMMARY_COLS)
        .order("approved_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; title: string }>("mock titles", (from, to) =>
      db().from("mocks").select("id, title").order("id").range(from, to),
    ),
  ]);
  const title = new Map(mocks.map((m) => [m.id, m.title]));
  return list.map((row) => {
    const {
      listening_started_at,
      reading_started_at,
      listening_minutes,
      reading_minutes,
      integrity,
      ...a
    } = row;
    const bands = {
      listening_band: num(a.listening_band),
      reading_band: num(a.reading_band),
      writing_band: num(a.writing_band),
      overall_band: num(a.overall_band),
    };
    return {
      ...a,
      ...bands,
      stage: adminStage({ ...a, ...bands }),
      mock_title: title.get(a.mock_id) ?? "(deleted mock)",
      // The full event list stays on the server; the list needs only the verdict.
      integrity: verdictFor({
        integrity,
        listening_started_at,
        listening_submitted_at: a.listening_submitted_at,
        listening_minutes,
        reading_started_at,
        reading_submitted_at: a.reading_submitted_at,
        reading_minutes,
      }),
    };
  });
}

/**
 * Position of an attempt in its mock's grading queue: submitted and ungraded,
 * oldest submission first. `nextId` skips the current attempt, so "Save & next"
 * moves on even though the current one has just left the queue.
 */
export async function gradingQueue(
  attemptId: string,
  mockId: string,
): Promise<{ position: number | null; total: number; prevId: string | null; nextId: string | null }> {
  const list = await fetchAll<AdminAttemptRowLite & { submitted_at: string | null }>("queue", (from, to) =>
    db()
      .from("mock_attempts")
      .select(`${STAGE_COLS}, submitted_at`)
      .eq("mock_id", mockId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
      .order("id")
      .range(from, to),
  );
  const queue = list.filter((a) => adminStage(liteStage(a)) === "needs_grading").map((a) => a.id);
  const i = queue.indexOf(attemptId);
  if (i === -1) {
    return { position: null, total: queue.length, prevId: null, nextId: queue[0] ?? null };
  }
  return {
    position: i + 1,
    total: queue.length,
    prevId: i > 0 ? queue[i - 1] : null,
    nextId: queue[i + 1] ?? (i > 0 ? queue[0] : null),
  };
}

// ------------------------------------------------------------- mock writes

export type MockInput = {
  id?: string;
  title: string;
  description: string | null;
  listening_test_id: string | null;
  reading_test_id: string | null;
  writing_task1_prompt: string | null;
  writing_task2_prompt: string | null;
  writing_minutes: number;
  listening_minutes: number;
  reading_minutes: number;
  published: boolean;
};

async function attemptCount(mockId: string): Promise<number> {
  const { count, error } = await db()
    .from("mock_attempts")
    .select("id", { count: "exact", head: true })
    .eq("mock_id", mockId);
  if (error) throw new Error(`[mock-admin] attempt count failed: ${error.message}`);
  return count ?? 0;
}

const LOCKED_MESSAGE =
  "Students already have places on this mock, so its papers, prompts, writing time and image are locked. Duplicate it to make a changed version.";

const norm = (s: string | null | undefined) => (s ?? "").trim();

/**
 * Create or edit a mock.
 *
 * EXAM CONTENT LOCKS once any place exists: papers, prompts, writing time and
 * the Task 1 image. Changing them under a student who is mid-exam moved their
 * deadline, and changing them afterwards made old reviews show the wrong
 * material. Title, description and publication stay editable.
 */
export async function saveMock(
  input: MockInput,
): Promise<{ ok: true; id: string; issues: string[] } | { ok: false; error: string; issues?: string[] }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the mock a title." };
  const mins = (v: unknown, fallback: number) => Math.round(Number(v ?? fallback) || 0);
  const minutes = mins(input.writing_minutes, 60);

  const candidate = {
    listening_test_id: input.listening_test_id || null,
    reading_test_id: input.reading_test_id || null,
    writing_task1_prompt: norm(input.writing_task1_prompt) || null,
    writing_task2_prompt: norm(input.writing_task2_prompt) || null,
    writing_minutes: minutes,
    listening_minutes: mins(input.listening_minutes, 40),
    reading_minutes: mins(input.reading_minutes, 60),
  };

  const ids = [candidate.listening_test_id, candidate.reading_test_id].filter(Boolean) as string[];
  const papers = new Map((ids.length ? await loadPapers(ids) : []).map((p) => [p.id, p]));
  const issues = readinessIssues(candidate, papers);
  for (const [label, m] of [
    ["Listening", candidate.listening_minutes],
    ["Reading", candidate.reading_minutes],
    ["Writing", candidate.writing_minutes],
  ] as const) {
    if (m < 10 || m > 180) return { ok: false, error: `${label} time must be 10–180 minutes.` };
  }
  if (input.published && issues.length) {
    return { ok: false, error: "This mock isn't ready to publish.", issues };
  }

  const row: TablesUpdate<"mocks"> = {
    title,
    description: norm(input.description) || null,
    published: input.published,
    updated_at: new Date().toISOString(),
    ...candidate,
  };

  const client = db();
  if (input.id) {
    const current = await getMock(input.id);
    if (!current) return { ok: false, error: "That mock no longer exists." };
    if ((await attemptCount(input.id)) > 0) {
      const changed =
        current.listening_test_id !== candidate.listening_test_id ||
        current.reading_test_id !== candidate.reading_test_id ||
        norm(current.writing_task1_prompt) !== norm(candidate.writing_task1_prompt) ||
        norm(current.writing_task2_prompt) !== norm(candidate.writing_task2_prompt) ||
        current.writing_minutes !== candidate.writing_minutes ||
        current.listening_minutes !== candidate.listening_minutes ||
        current.reading_minutes !== candidate.reading_minutes;
      if (changed) return { ok: false, error: LOCKED_MESSAGE };
    }
    const { error } = await client.from("mocks").update(row).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: input.id, issues };
  }
  const { data, error } = await client.from("mocks").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id, issues };
}

export async function setMockPublished(
  mockId: string,
  published: boolean,
): Promise<LibResult & { issues?: string[] }> {
  const mock = await getMock(mockId);
  if (!mock) return { ok: false, error: "That mock no longer exists." };
  if (published) {
    const issues = await issuesFor(mock);
    if (issues.length) return { ok: false, error: "This mock isn't ready to publish.", issues };
  }
  const { error } = await db()
    .from("mocks")
    .update({ published, updated_at: new Date().toISOString() })
    .eq("id", mockId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** A new DRAFT with the same content — the way to change a locked mock. */
export async function duplicateMock(mockId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const m = await getMock(mockId);
  if (!m) return { ok: false, error: "That mock no longer exists." };
  const { data, error } = await db()
    .from("mocks")
    .insert({
      title: `${m.title} (copy)`,
      description: m.description,
      listening_test_id: m.listening_test_id,
      reading_test_id: m.reading_test_id,
      writing_task1_prompt: m.writing_task1_prompt,
      // Storage objects are never deleted, so sharing the path is safe.
      writing_task1_image_path: m.writing_task1_image_path,
      writing_task2_prompt: m.writing_task2_prompt,
      writing_minutes: m.writing_minutes,
      listening_minutes: m.listening_minutes,
      reading_minutes: m.reading_minutes,
      published: false,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function uploadTask1Image(mockId: string, file: File): Promise<LibResult> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "Task 1 image must be an image file." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Keep the image under 5 MB." };
  if (!(await getMock(mockId))) return { ok: false, error: "That mock no longer exists." };
  if ((await attemptCount(mockId)) > 0) return { ok: false, error: LOCKED_MESSAGE };

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  // A fresh path per upload, and old objects are KEPT: attempts snapshot the
  // path they were given (0051), so deleting a replaced image would blank an
  // old review.
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

export async function removeTask1Image(mockId: string): Promise<LibResult> {
  if ((await attemptCount(mockId)) > 0) return { ok: false, error: LOCKED_MESSAGE };
  const { error } = await db()
    .from("mocks")
    .update({ writing_task1_image_path: null, updated_at: new Date().toISOString() })
    .eq("id", mockId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Only while nobody has a place — attempts are the permanent record. */
export async function deleteMock(mockId: string): Promise<LibResult> {
  if ((await attemptCount(mockId)) > 0) {
    return { ok: false, error: "Students have places on this mock, so it is kept. Unpublish it instead." };
  }
  const { error } = await db().from("mocks").delete().eq("id", mockId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------- place writes

type PlaceResult = { ok: true; alreadyHad: boolean } | { ok: false; error: string };

/**
 * Gives a student a place. The 0051 trigger closes their pending request for
 * this mock in the same transaction, so a direct grant can no longer leave a
 * request "waiting" for someone who is already in.
 *
 * A second grant for a student who already has a place is NOT an error for the
 * caller's purposes — it reconciles (returns alreadyHad) so a retried approval
 * converges instead of failing forever.
 */
async function createAttempt(
  userId: string,
  mockId: string,
  requestId: string | null,
  adminId: string | null,
): Promise<PlaceResult> {
  const client = db();
  const [mock, profRes] = await Promise.all([
    getMock(mockId),
    client.from("profiles").select("name, email").eq("id", userId).maybeSingle(),
  ]);
  if (!mock) return { ok: false, error: "That mock no longer exists." };
  const issues = await issuesFor(mock);
  if (issues.length) return { ok: false, error: `This mock isn't ready: ${issues.join(" ")}` };
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
    // Snapshots (0051): the exam this student sits cannot change under them.
    writing_minutes: mock.writing_minutes,
    listening_minutes: mock.listening_minutes,
    reading_minutes: mock.reading_minutes,
    writing_task1_image_path: mock.writing_task1_image_path,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, alreadyHad: true };
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
  return { ok: true, alreadyHad: false };
}

export async function approveRequest(
  requestId: string,
  adminId: string | null,
): Promise<LibResult & { note?: string }> {
  if (!UUID.test(requestId)) return { ok: false, error: "That request no longer exists." };
  const client = db();
  const { data, error } = await client
    .from("mock_requests")
    .select("id, user_id, mock_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const req = data as { id: string; user_id: string; mock_id: string; status: string } | null;
  if (!req) return { ok: false, error: "That request no longer exists." };
  if (req.status === "rejected") return { ok: false, error: "That request was already rejected." };
  if (req.status === "approved") return { ok: true, note: "Already approved." };

  const placed = await createAttempt(req.user_id, req.mock_id, req.id, adminId);
  if (!placed.ok) return placed;

  if (placed.alreadyHad) {
    // The trigger only fires on a NEW place; close this stray request by hand.
    const { error: upErr } = await client
      .from("mock_requests")
      .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: adminId })
      .eq("id", req.id)
      .eq("status", "pending");
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, note: "They already had a place; the request is now closed." };
  }
  return { ok: true };
}

export async function rejectRequest(requestId: string, adminId: string | null): Promise<LibResult> {
  if (!UUID.test(requestId)) return { ok: false, error: "That request no longer exists." };
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

export async function grantByEmail(email: string, mockId: string, adminId: string | null): Promise<LibResult & { note?: string }> {
  const { data, error } = await db().from("profiles").select("id").ilike("email", email.trim()).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const target = data as { id: string } | null;
  if (!target) return { ok: false, error: "No user found with that email." };
  const placed = await createAttempt(target.id, mockId, null, adminId);
  if (!placed.ok) return placed;
  return placed.alreadyHad ? { ok: false, error: "That student already has a place on this mock." } : { ok: true };
}

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

// ---------------------------------------------------------- grade + release

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
  if (input.feedback.length > MAX_FEEDBACK) {
    return { ok: false, error: `Feedback is limited to ${MAX_FEEDBACK} characters.` };
  }

  const client = db();
  const { data, error: readErr } = await client
    .from("mock_attempts")
    .select("status, listening_band, reading_band, writing_submitted_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const a = data as { status: string; listening_band: unknown; reading_band: unknown; writing_submitted_at: string | null } | null;
  if (!a) return { ok: false, error: "That attempt no longer exists." };
  if (!a.writing_submitted_at) return { ok: false, error: "The student hasn't submitted their writing yet." };

  const overall = overallBand({ listening: num(a.listening_band), reading: num(a.reading_band), writing });
  const { error } = await client
    .from("mock_attempts")
    .update({
      writing_task1_band: input.task1,
      writing_task2_band: input.task2,
      writing_band: writing,
      writing_feedback: input.feedback.trim() || null,
      overall_band: overall,
      graded_at: new Date().toISOString(),
      graded_by: adminId,
    })
    .eq("id", attemptId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export const MAX_FEEDBACK = 5000;

/**
 * Publish one result. The update is conditional on status = 'submitted' AND
 * returns the row, and the notification is sent only when THIS call flipped it
 * — two competing releases (web + a double click, or a bulk run overlapping a
 * single one) can no longer notify the student twice.
 */
export async function releaseAttempt(attemptId: string, adminId: string | null): Promise<LibResult> {
  const client = db();
  const { data, error: readErr } = await client
    .from("mock_attempts")
    .select("user_id, mock_id, status, writing_band, overall_band")
    .eq("id", attemptId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const a = data as { user_id: string | null; mock_id: string; status: string; writing_band: unknown; overall_band: unknown } | null;
  if (!a) return { ok: false, error: "That attempt no longer exists." };
  if (a.status === "released") return { ok: false, error: "Already released." };
  if (a.status !== "submitted") return { ok: false, error: "The student hasn't finished the mock yet." };
  if (num(a.writing_band) == null || num(a.overall_band) == null) {
    return { ok: false, error: "Grade the writing before releasing." };
  }

  const { data: flipped, error } = await client
    .from("mock_attempts")
    .update({ status: "released", released_at: new Date().toISOString(), released_by: adminId })
    .eq("id", attemptId)
    .eq("status", "submitted")
    .not("overall_band", "is", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!flipped?.length) return { ok: false, error: "Already released." };

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

// --------------------------------------------------------------------- bulk

export type BulkOutcome = { done: number; skipped: { id: string; reason: string }[] };

/** Sequential on purpose: tens of rows, and each item keeps its own guards and notification. */
async function runBulk(ids: string[], fn: (id: string) => Promise<LibResult>): Promise<BulkOutcome> {
  const out: BulkOutcome = { done: 0, skipped: [] };
  for (const id of [...new Set(ids)].slice(0, 500)) {
    try {
      const res = await fn(id);
      if (res.ok) out.done++;
      else out.skipped.push({ id, reason: res.error });
    } catch (e) {
      out.skipped.push({ id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export function bulkApprove(requestIds: string[], adminId: string | null): Promise<BulkOutcome> {
  return runBulk(requestIds, (id) => approveRequest(id, adminId));
}

/** Only server-verified ready attempts are released; everything else is reported as skipped. */
export function bulkRelease(attemptIds: string[], adminId: string | null): Promise<BulkOutcome> {
  return runBulk(attemptIds, (id) => releaseAttempt(id, adminId));
}

export type { AttemptRow };
export { ATTEMPT_COLS };
