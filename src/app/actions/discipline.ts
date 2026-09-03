"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rows } from "@/types/database";
import { createTestFromHtml } from "@/lib/tests/create";
import { inferQuestionTypes } from "@/lib/ielts/infer-question-types";

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

export type DisciplineMemberRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  current_day: number;
  strikes: number;
  granted_at: string;
  completed: number;
};

/** Everyone currently in the challenge, with how many days they have finished. */
export async function listDisciplineMembers(): Promise<
  { ok: true; members: DisciplineMemberRow[] } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  // Service-role: the members policy lets an admin read every row, but the
  // profile join and the completion counts are simpler with one trusted client.
  const db = createAdminClient();

  const { data: memberRows, error } = await db
    .from("discipline_members")
    .select("user_id, current_day, strikes, granted_at")
    .order("granted_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const members = rows<{
    user_id: string;
    current_day: number;
    strikes: number;
    granted_at: string;
  }>(memberRows);
  if (members.length === 0) return { ok: true, members: [] };

  const ids = members.map((m) => m.user_id);

  const { data: profileRows } = await db
    .from("profiles")
    .select("id, email, name")
    .in("id", ids);
  const byId = new Map(
    rows<{ id: string; email: string | null; name: string | null }>(profileRows).map((p) => [
      p.id,
      p,
    ]),
  );

  const { data: doneRows } = await db
    .from("discipline_completions")
    .select("user_id")
    .in("user_id", ids);
  const counts = new Map<string, number>();
  for (const r of rows<{ user_id: string }>(doneRows)) {
    counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  }

  return {
    ok: true,
    members: members.map((m) => ({
      ...m,
      email: byId.get(m.user_id)?.email ?? null,
      name: byId.get(m.user_id)?.name ?? null,
      completed: counts.get(m.user_id) ?? 0,
    })),
  };
}

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

export async function addDisciplineDay(
  dayNumber: number,
  title: string,
  instructions: string,
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Number.isInteger(dayNumber) || dayNumber < 1) {
    return { ok: false, error: "Day number must be a whole number, 1 or more." };
  }

  const { error } = await createAdminClient()
    .from("discipline_days")
    .insert({
      day_number: dayNumber,
      title: title.trim() || null,
      instructions: instructions.trim() || null,
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
): Promise<DisciplineActionResult> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await createAdminClient()
    .from("discipline_days")
    .update({ title: title.trim() || null, instructions: instructions.trim() || null })
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
  // everyone, including the owner who just uploaded it.
  const { data: existing } = await createAdminClient()
    .from("discipline_day_tests")
    .select("test_id")
    .eq("day_id", dayId);
  const position = rows<{ test_id: string }>(existing).length;

  const { error } = await createAdminClient()
    .from("discipline_day_tests")
    .insert({ day_id: dayId, test_id: created.id, position });
  if (error) return { ok: false, error: `Uploaded, but not attached: ${error.message}` };

  refresh();
  return { ok: true };
}
