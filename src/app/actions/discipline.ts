"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rows } from "@/types/database";
import { createTestFromHtml } from "@/lib/tests/create";
import { inferQuestionTypes } from "@/lib/ielts/infer-question-types";
import { attachTestToDay, loadProgressGrid } from "@/lib/discipline";
import { buildProgressReport } from "@/lib/discipline-report";
import { reportFilename, type ReportFilters } from "@/lib/discipline-report-text";

// Admin actions for the Discipline challenge (migration 0046).
//
// Membership and strikes go through the SECURITY DEFINER RPCs, which re-check
// `is_admin(auth.uid())` in the database — so the gate below is a courtesy that
// gives a readable error, not the thing keeping a student out. Programme edits
// (days and their tests) are written with the service-role client, because 0046
// grants no client role INSERT/UPDATE/DELETE on any discipline table.

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ok: false as const, error: "Not signed in." };

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((data as { role?: string } | null)?.role !== "admin") {
    return { supabase, user, ok: false as const, error: "Admins only." };
  }
  return { supabase, user, ok: true as const, error: null };
}

export type DisciplineActionResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/admin/discipline");
  revalidatePath("/discipline");
}

// ------------------------------------------------------------- membership

export type StudentRow = { id: string; email: string | null; name: string | null };

/**
 * Accounts the owner can add to the challenge.
 *
 * An EMPTY query returns the whole roster (newest first) rather than nothing:
 * picking students off a list is the normal case, and making the owner search
 * first was an extra step for a list of about a hundred people. Search narrows.
 */
export async function searchStudents(
  query: string,
): Promise<{ ok: true; users: StudentRow[] } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  // Strip characters with meaning in PostgREST filter syntax before interpolating.
  const q = query.trim().replace(/[,()*\\]/g, "");
  let req = supabase
    .from("profiles")
    .select("id, email, name")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q) req = req.or(`email.ilike.%${q}%,name.ilike.%${q}%`);

  const { data, error } = await req;
  if (error) return { ok: false, error: error.message };
  return { ok: true, users: rows<StudentRow>(data) };
}

async function callRpc(
  fn: "grant_discipline" | "revoke_discipline" | "add_discipline_strike" | "reset_discipline",
  email: string,
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await gate.supabase.rpc(fn, { target_email: email.trim() });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function grantDiscipline(email: string) {
  return callRpc("grant_discipline", email);
}
export async function revokeDiscipline(email: string) {
  return callRpc("revoke_discipline", email);
}
export async function addDisciplineStrike(email: string) {
  return callRpc("add_discipline_strike", email);
}
export async function resetDiscipline(email: string) {
  return callRpc("reset_discipline", email);
}

// -------------------------------------------------------------- programme

/**
 * The Deadline field's value, as the database should store it.
 *
 * The admin form sends an ISO instant the browser built from a
 * `datetime-local` input, so the moment is already anchored to the OWNER's
 * timezone — exactly what we want, since they are the one saying "Friday
 * night". An empty string clears the deadline; anything unparseable is
 * refused rather than silently stored as null, which would look like a
 * successful save that quietly dropped the date.
 */
function parseDueAt(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const t = new Date(trimmed);
  if (Number.isNaN(t.getTime())) return { ok: false, error: "That deadline is not a valid date." };
  return { ok: true, value: t.toISOString() };
}

export async function addDisciplineDay(
  dayNumber: number,
  title: string,
  instructions: string,
  dueAt = "",
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    return { ok: false, error: "Day number must be a whole number, 1 or more." };
  }
  const due = parseDueAt(dueAt);
  if (!due.ok) return { ok: false, error: due.error };

  const { error } = await createAdminClient()
    .from("discipline_days")
    .insert({
      day_number: dayNumber,
      title: title.trim() || null,
      instructions: instructions.trim() || null,
      // Explicit, though 0047 also defaults it: a new day is a DRAFT. Building
      // it in front of the students was the whole problem this fixes.
      published: false,
      due_at: due.value,
    });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? `Day ${dayNumber} already exists.` : error.message,
    };
  }
  refresh();
  return { ok: true };
}

/**
 * Publish a day, or pull it back to draft (migration 0047).
 *
 * A day is created as a DRAFT, so the owner can load a week of papers in
 * advance and release them when they choose. Nothing about a draft reaches a
 * student: the RLS policies from 0047 hide the day and its test links, the
 * loaders filter on `published`, and `assertTestAccess` refuses the paper
 * itself even to a member who guesses its URL.
 *
 * PUBLISHING AN EMPTY DAY IS REFUSED. `deriveDayStatus` only ever calls a day
 * complete when it has at least one test, so a live day with none would be
 * permanently unfinishable and would lock every day behind it — a dead end the
 * student cannot escape and the owner would have no obvious reason to suspect.
 *
 * UNPUBLISHING IS ALWAYS ALLOWED, and costs nobody their progress: completion
 * is derived from `results` rows, which are untouched here. The day simply
 * disappears until it comes back.
 */
export async function setDayPublished(
  dayId: string,
  published: boolean,
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = createAdminClient();

  if (published) {
    const { data: attached, error: readErr } = await db
      .from("discipline_day_tests")
      .select("test_id")
      .eq("day_id", dayId);
    if (readErr) return { ok: false, error: readErr.message };
    if (rows<{ test_id: string }>(attached).length === 0) {
      return {
        ok: false,
        error: "Add at least one test before publishing — an empty day can never be finished.",
      };
    }
  }

  const { error } = await db
    .from("discipline_days")
    .update({ published, published_at: published ? new Date().toISOString() : null })
    .eq("id", dayId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteDisciplineDay(dayId: string): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  // The tests themselves are NOT deleted — only the day and its attachments
  // (discipline_day_tests cascades). A paper stays in the library.
  const { error } = await createAdminClient().from("discipline_days").delete().eq("id", dayId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function attachTest(
  dayId: string,
  testId: string,
  position: number,
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await createAdminClient()
    .from("discipline_day_tests")
    .upsert({ day_id: dayId, test_id: testId, position }, { onConflict: "day_id,test_id" });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function detachTest(dayId: string, testId: string): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await createAdminClient()
    .from("discipline_day_tests")
    .delete()
    .eq("day_id", dayId)
    .eq("test_id", testId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export type PickableTest = {
  id: string;
  title: string;
  skill: "reading" | "listening";
  track: string;
};

/**
 * Tests the owner can attach to a day: anything in the library.
 *
 * Discipline-track papers come first — those were uploaded FOR the challenge
 * and are invisible everywhere else, so an unattached one is a loose end.
 * Regular papers stay pickable, which is what "import from the overall tests"
 * means; attaching one does not make it private.
 */
export async function searchAttachableTests(
  query: string,
): Promise<{ ok: true; tests: PickableTest[] } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const q = query.trim().replace(/[,()*\\]/g, "");
  let req = createAdminClient()
    .from("tests")
    .select("id, title, skill, track")
    .order("created_at", { ascending: false })
    .limit(60);
  if (q) req = req.ilike("title", `%${q}%`);

  const { data, error } = await req;
  if (error) return { ok: false, error: error.message };

  const tests = rows<PickableTest>(data);
  tests.sort((a, b) => Number(b.track === "discipline") - Number(a.track === "discipline"));
  return { ok: true, tests };
}

// --------------------------------------------------- editing an existing day

export async function updateDisciplineDay(
  dayId: string,
  title: string,
  instructions: string,
  /** ISO instant, or "" to clear the deadline. */
  dueAt = "",
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const due = parseDueAt(dueAt);
  if (!due.ok) return { ok: false, error: due.error };

  const { error } = await createAdminClient()
    .from("discipline_days")
    .update({
      title: title.trim() || null,
      instructions: instructions.trim() || null,
      due_at: due.value,
    })
    .eq("id", dayId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/**
 * Swap a day with its neighbour, moving it up or down the programme.
 *
 * `day_number` is UNIQUE, so a straight two-step swap collides at step one.
 * This parks the mover on a negative number first — negatives can never clash
 * with a real day, and the constraint stays enforced throughout.
 */
export async function moveDay(
  dayId: string,
  direction: "up" | "down",
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = createAdminClient();

  const { data: allRows, error: readErr } = await db
    .from("discipline_days")
    .select("id, day_number")
    .order("day_number", { ascending: true });
  if (readErr) return { ok: false, error: readErr.message };

  const all = rows<{ id: string; day_number: number }>(allRows);
  const i = all.findIndex((d) => d.id === dayId);
  if (i === -1) return { ok: false, error: "That day no longer exists." };

  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return { ok: true }; // already at the end

  const a = all[i];
  const b = all[j];
  const park = -Math.abs(a.day_number) - 1;

  for (const step of [
    { id: a.id, day_number: park },
    { id: b.id, day_number: a.day_number },
    { id: a.id, day_number: b.day_number },
  ]) {
    const { error } = await db
      .from("discipline_days")
      .update({ day_number: step.day_number })
      .eq("id", step.id);
    if (error) return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

/** Reorder the tests inside one day. `position` has no unique constraint. */
export async function moveTest(
  dayId: string,
  testId: string,
  direction: "up" | "down",
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = createAdminClient();

  const { data: linkRows, error: readErr } = await db
    .from("discipline_day_tests")
    .select("test_id, position")
    .eq("day_id", dayId);
  if (readErr) return { ok: false, error: readErr.message };

  const links = rows<{ test_id: string; position: number }>(linkRows).sort(
    (x, y) => x.position - y.position,
  );
  const i = links.findIndex((l) => l.test_id === testId);
  if (i === -1) return { ok: false, error: "That test is not on this day." };
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= links.length) return { ok: true };

  [links[i], links[j]] = [links[j], links[i]];

  // Rewrite every position from 0 — cheaper to reason about than a swap, and
  // it repairs any duplicate positions left by an older edit.
  for (let k = 0; k < links.length; k++) {
    const { error } = await db
      .from("discipline_day_tests")
      .update({ position: k })
      .eq("day_id", dayId)
      .eq("test_id", links[k].test_id);
    if (error) return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true };
}

// ------------------------------------------- uploading a paper into a day

/**
 * Upload a CDI file straight into a Discipline day.
 *
 * Goes through createTestFromHtml() — the ONE place a `tests` row and its
 * storage object are created — so the answer-key extraction, the duplicate
 * title rule and the storage write cannot drift from the main upload form.
 * The track is forced to 'discipline' and the tier to 'free': a paper uploaded
 * here exists only inside the challenge, so a premium gate on top of the
 * membership gate would be a second lock on the same door.
 */
export async function uploadDisciplineTest(formData: FormData): Promise<
  DisciplineActionResult
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const dayId = String(formData.get("dayId") || "");
  const title = String(formData.get("title") || "").trim();
  const skillRaw = String(formData.get("skill") || "reading");
  const kindRaw = String(formData.get("kind") || "single");
  const file = formData.get("file");

  if (!dayId) return { ok: false, error: "Pick a day first." };
  if (!title) return { ok: false, error: "Give the paper a title." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an HTML file." };
  }

  const html = await file.text();
  const created = await createTestFromHtml({
    title,
    skill: skillRaw === "listening" ? "listening" : "reading",
    kind: kindRaw === "full" ? "full" : "single",
    tier: "free",
    track: "discipline",
    questionTypes: inferQuestionTypes(html).types,
    level: null,
    passage: null,
    html,
    createdBy: gate.user.id,
  });
  if (!created.ok) return { ok: false, error: created.error };

  // Attach it immediately. An unattached discipline paper is invisible to
  // everyone, including the owner who just uploaded it. Shared with the
  // /admin/tests upload path so the two doors cannot drift.
  const attached = await attachTestToDay(dayId, created.id);
  if (!attached.ok) return { ok: false, error: `Uploaded, but not attached: ${attached.error}` };

  refresh();
  return { ok: true };
}

// ------------------------------------------------------------ Word export

export type ProgressReportResult =
  | { ok: true; filename: string; base64: string }
  | { ok: false; error: string };

/**
 * The Progress tab as a Word document.
 *
 * `userIds` says WHICH rows to include — the ones the owner's filters were
 * showing — and nothing else. The numbers are re-derived here with
 * `loadProgressGrid()`, so the client chooses the selection but never supplies
 * the figures: a tampered browser cannot mint a report claiming whatever scores
 * it likes. Same principle as scored records being written by the server.
 *
 * **No email address goes into the file.** `buildProgressReport` never reads
 * `GridRow.email`, and there is no option to include it — the report is a file
 * that gets forwarded to a group.
 *
 * Returned base64 rather than streamed from a route handler: this reuses
 * `assertAdmin()` above (one gate for the whole feature, instead of a new route
 * with its own), and the document is tens of KB for a realistic cohort, where
 * base64's third of overhead does not matter.
 */
export async function exportDisciplineReport(
  userIds: string[],
  filters: ReportFilters,
): Promise<ProgressReportResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { ok: false, error: "Nothing to export — no students are shown." };
  }

  try {
    const grid = await loadProgressGrid();
    const now = new Date();
    const buffer = await buildProgressReport(grid, userIds, filters, now);
    return { ok: true, filename: reportFilename(now), base64: buffer.toString("base64") };
  } catch (e) {
    console.error(`[exportDisciplineReport] ${String(e)}`);
    return { ok: false, error: "Could not build the Word file." };
  }
}
