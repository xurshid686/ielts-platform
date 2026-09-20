import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createTestFromHtml, type Kind, type Tier, type Track } from "@/lib/tests/create";
import { inferQuestionTypes } from "@/lib/ielts/infer-question-types";
import type { Json } from "@/types/database";

// The owner's side of the PDF → CDI converter (migration 0059).
//
// Same contract as lib/mock-admin.ts and lib/tests/create.ts: service role,
// authorisation-free, gated by its callers — requireOwner() on the page and
// assertOwner() in app/actions/converter.ts. Do not call any of this from
// anywhere that has not gated first.
//
// WHY THE SITE DOES NOT CONVERT ANYTHING ITSELF
//
// The pipeline lives in X:\CDI READING PROJECT\cdi and needs Python with
// PyMuPDF, a real Chrome for the browser gate, and `agy.exe` — a desktop-only
// Gemini CLI that supplies the free cross-family second opinion on the answer
// key. None of that exists on App Platform, and moving it there would cost the
// second derivation. So the server's whole share is: hold a queue, hold two
// files, and show what came back. A worker on the owner's machine does the work.
//
// NOTHING HERE PUBLISHES BY ITSELF. `passed` is a terminal state until
// publishJob() is called explicitly, and that goes through createTestFromHtml()
// — the one shared path — so the answer-key refusal cannot drift.

export const BUCKET = "conversions";

export type JobStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "published"
  | "cancelled";

export type ConversionJob = {
  id: string;
  test_id: string;
  title: string;
  pdf_path: string | null;
  html_path: string | null;
  status: JobStatus;
  stage: string | null;
  log: string | null;
  shape: Json | null;
  errata: Json | null;
  report: Json | null;
  published_test_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
};

const COLS =
  "id, test_id, title, pdf_path, html_path, status, stage, log, shape, errata, report, published_test_id, created_by, created_at, updated_at, claimed_at";

/**
 * A test id that is safe as both a folder name and a storage path segment.
 *
 * The worker uses it verbatim as `tests/<id>/` on a Windows filesystem, so a
 * slash or a colon here becomes a path traversal or an unwritable directory on
 * the owner's machine. Restricting it at submission is cheaper than sanitising
 * it in two languages.
 */
export function normaliseTestId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type SubmitInput = {
  testId: string;
  title: string;
  pdf: File;
  createdBy: string;
};

export type SubmitResult = { ok: true; id: string } | { ok: false; error: string };

export async function submitJob(input: SubmitInput): Promise<SubmitResult> {
  const testId = normaliseTestId(input.testId);
  const title = input.title.trim();
  if (!testId) return { ok: false, error: "A test id is required." };
  if (!title) return { ok: false, error: "A title is required." };
  if (!input.pdf || input.pdf.size === 0) return { ok: false, error: "Choose a PDF." };

  const db = createAdminClient();

  // One live job per test id. Two workers on the same `tests/<id>/` folder
  // would overwrite each other's source files mid-build.
  const { data: live } = await db
    .from("conversion_jobs")
    .select("id, status")
    .eq("test_id", testId)
    .in("status", ["queued", "running"])
    .limit(1);
  if (live && live.length) {
    return { ok: false, error: `A job for "${testId}" is already queued or running.` };
  }

  const path = `${testId}/${Date.now()}-source.pdf`;
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, await input.pdf.arrayBuffer(), {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { data, error } = await db
    .from("conversion_jobs")
    .insert({
      test_id: testId,
      title,
      pdf_path: path,
      status: "queued",
      stage: "waiting for the worker",
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Do not leave the object behind when the row it belongs to never existed.
    await db.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error?.message ?? "Could not queue the job." };
  }
  return { ok: true, id: data.id };
}

export async function listJobs(limit = 25): Promise<ConversionJob[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("conversion_jobs")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ConversionJob[];
}

export async function getJob(id: string): Promise<ConversionJob | null> {
  const db = createAdminClient();
  const { data } = await db.from("conversion_jobs").select(COLS).eq("id", id).maybeSingle();
  return (data as unknown as ConversionJob) ?? null;
}

export async function cancelJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  // Only a job that has not been claimed. A running build owns files on the
  // owner's machine, and marking it cancelled here would not stop it.
  // The status filter is the guard, and the returned rows are the proof it
  // held: an empty array means the worker claimed the job first.
  const { data, error } = await db
    .from("conversion_jobs")
    .update({ status: "cancelled", stage: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Only a job still waiting can be cancelled." };
  }
  return { ok: true };
}

export async function deleteJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  const job = await getJob(id);
  if (!job) return { ok: false, error: "No such job." };
  if (job.status === "running") {
    return { ok: false, error: "This job is being built right now." };
  }
  const paths = [job.pdf_path, job.html_path].filter(Boolean) as string[];
  if (paths.length) await db.storage.from(BUCKET).remove(paths);
  const { error } = await db.from("conversion_jobs").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** The built player, for the preview and for publishing. */
export async function downloadHtml(job: ConversionJob): Promise<string | null> {
  if (!job.html_path) return null;
  const db = createAdminClient();
  const { data, error } = await db.storage.from(BUCKET).download(job.html_path);
  if (error || !data) return null;
  return await data.text();
}

export type PublishInput = {
  id: string;
  tier: Tier;
  track: Track;
  level: string | null;
  createdBy: string;
  /** Set only when the owner has ticked the box for a high-severity erratum. */
  acknowledged?: boolean;
};

type Erratum = { q: number; severity?: string };

/**
 * Questions where every model that looked disagreed with the printed key, or
 * where the paper printed no key at all.
 *
 * Codex reviewed the answer pipeline on 2026-09-20 and made the point this
 * guards: the design faithfully reproduces the book, so when the book is wrong
 * it ships the wrong answer and merely logs it. Two independent derivations
 * agreeing against the key is the strongest evidence available that a question
 * is wrong, and it was reaching Publish as one line in a list.
 *
 * It still ships the printed key - that is the owner's standing decision, and
 * what the corpus already does. What changes is that it cannot be published
 * without someone having looked.
 */
function highSeverity(errata: Json | null): number[] {
  if (!Array.isArray(errata)) return [];
  return (errata as Erratum[])
    .filter((e) => e && e.severity === "high")
    .map((e) => e.q);
}

export type PublishResult = { ok: true; testId: string } | { ok: false; error: string };

/**
 * Turn a passed job into a real test.
 *
 * Everything that decides what the test IS comes from the built file, not from
 * the form: the kind and the passage number are read back from the shape the
 * converter recorded, so a full test cannot be published as a single passage by
 * mis-clicking. Tier, track and level are genuine editorial choices and stay on
 * the form.
 */
export async function publishJob(input: PublishInput): Promise<PublishResult> {
  const db = createAdminClient();
  const job = await getJob(input.id);
  if (!job) return { ok: false, error: "No such job." };
  if (job.status !== "passed") {
    return { ok: false, error: `Only a job that passed every gate can be published (this one is ${job.status}).` };
  }

  const flagged = highSeverity(job.errata);
  if (flagged.length && !input.acknowledged) {
    return {
      ok: false,
      error:
        `Q${flagged.join(", Q")} ${flagged.length === 1 ? "is" : "are"} flagged: ` +
        "every model that answered disagreed with the printed key, or the paper " +
        "printed none. The printed key will ship. Check those question(s) against " +
        "the book, then tick the box to publish.",
    };
  }

  const html = await downloadHtml(job);
  if (!html) return { ok: false, error: "The built file is missing from storage." };

  const shape = (job.shape ?? {}) as { parts?: number; passage?: number | null };
  const kind: Kind = shape.parts === 1 ? "single" : "full";
  const passage = kind === "single" && typeof shape.passage === "number" ? shape.passage : null;

  const created = await createTestFromHtml({
    title: job.title,
    skill: "reading",
    kind,
    tier: input.tier,
    track: input.track,
    questionTypes: inferQuestionTypes(html).types,
    level: input.level,
    passage,
    html,
    createdBy: input.createdBy,
  });
  if (!created.ok) return { ok: false, error: created.error };

  await db
    .from("conversion_jobs")
    .update({
      status: "published",
      stage: "published",
      published_test_id: created.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return { ok: true, testId: created.id };
}
