"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getMock,
  saveWriting,
  startAttempt,
  submitRequest,
  submitSection,
  type WritingSaveResult,
} from "@/lib/mock";
import {
  approveRequest,
  bulkApprove,
  bulkRelease,
  cancelAttempt,
  deleteMock,
  duplicateMock,
  grantByEmail,
  gradeWriting,
  rejectRequest,
  releaseAttempt,
  removeTask1Image,
  saveMock,
  setMockPublished,
  unreleaseAttempt,
  uploadTask1Image,
  type BulkOutcome,
  type MockInput,
} from "@/lib/mock-admin";
import { MAX_REQUEST_MESSAGE } from "@/lib/mock-shared";
import { notifyMockFinished, notifyMockRequest } from "@/lib/telegram/notify";

// Server actions for the Mock exam section (migration 0050).
//
// The rules live in @/lib/mock, which is service-role and authorisation-free by
// design. These are the doors: each establishes WHO is asking — the verified
// session for a student, assertAdmin() for the owner — then calls the library.
// The user id always comes from the session, never from the caller.
//
// Note what the student actions return: `{ ok }` and an error, never a score.
// A mock result reaches the browser only through /mock/[id]/result, and only
// once released.

export type MockActionResult = { ok: true } | { ok: false; error: string };

async function sessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function assertAdmin() {
  const { supabase, user } = await sessionUser();
  if (!user) return { user: null, ok: false as const, error: "Not signed in." };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((data as { role?: string } | null)?.role !== "admin") {
    return { user, ok: false as const, error: "Admins only." };
  }
  return { user, ok: true as const, error: null };
}

function refreshStudent(mockId?: string) {
  revalidatePath("/mock");
  if (mockId) revalidatePath(`/mock/${mockId}`);
}

function refreshAdmin() {
  revalidatePath("/admin/mocks");
  revalidatePath("/admin");
  revalidatePath("/mock");
}

// --------------------------------------------------------------- the student

export async function requestMock(mockId: string, message: string): Promise<MockActionResult> {
  const { supabase, user } = await sessionUser();
  if (!user) return { ok: false, error: "Sign in to request a mock." };

  const note = String(message ?? "").slice(0, MAX_REQUEST_MESSAGE);
  const res = await submitRequest(user.id, mockId, note);
  if (!res.ok) return res;

  const [{ data: prof }, mock] = await Promise.all([
    supabase.from("profiles").select("name, email").eq("id", user.id).maybeSingle(),
    getMock(mockId),
  ]);
  const who = (prof as { name?: string | null; email?: string | null } | null) ?? {};

  // After the response: an unreachable Telegram can neither delay nor fail the request.
  after(() =>
    notifyMockRequest({
      requestId: res.id,
      name: who.name ?? null,
      email: who.email ?? user.email ?? null,
      mockTitle: mock?.title ?? "a mock",
      message: note.trim(),
    }),
  );

  refreshStudent(mockId);
  revalidatePath("/admin/mocks");
  return { ok: true };
}

export async function beginMock(mockId: string): Promise<MockActionResult> {
  const { user } = await sessionUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const res = await startAttempt(user.id, mockId);
  if (res.ok) refreshStudent(mockId);
  return res;
}

/** Listening or Reading answers from the CDI player. Returns no score, by design. */
export async function submitMockSection(
  mockId: string,
  section: "listening" | "reading",
  answers: unknown,
): Promise<MockActionResult> {
  const { user } = await sessionUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again — your answers were not saved." };
  if (section !== "listening" && section !== "reading") return { ok: false, error: "Unknown section." };

  // NO revalidatePath here, deliberately. A server action that revalidates makes
  // Next re-render the CURRENT route when it returns — and the section page
  // redirects away from a submitted section, which unmounted the "submitted —
  // continue" screen before the student could read it (caught in the E2E run).
  // Every /mock page is dynamic, so there is no cache to invalidate anyway.
  return submitSection(user.id, mockId, section, answers);
}

export async function saveMockWriting(
  mockId: string,
  task1: string,
  task2: string,
  final: boolean,
): Promise<WritingSaveResult> {
  const { user } = await sessionUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const res = await saveWriting(user.id, mockId, String(task1 ?? ""), String(task2 ?? ""), !!final);
  if (res.ok && res.submitted) {
    const [mock, { supabase }] = await Promise.all([getMock(mockId), sessionUser()]);
    const { data: prof } = await supabase.from("profiles").select("name, email").eq("id", user.id).maybeSingle();
    const who = (prof as { name?: string | null; email?: string | null } | null) ?? {};
    after(() =>
      notifyMockFinished({
        name: who.name ?? null,
        email: who.email ?? user.email ?? null,
        mockTitle: mock?.title ?? "a mock",
      }),
    );
    // No revalidatePath: same reason as submitMockSection.
  }
  return res;
}

// ----------------------------------------------------------------- the owner
//
// Every owner action catches its own failures and returns them as an error
// result, so a network or database failure shows up as a message in the panel
// instead of an unhandled rejection that loses the owner's edits.

async function guarded<T extends { ok: boolean }>(
  label: string,
  fn: (adminId: string) => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    return await fn(gate.user.id);
  } catch (e) {
    console.error(`[mock action] ${label}`, e);
    return { ok: false, error: "Something went wrong on the server. Nothing was changed — try again." };
  }
}

export type MockAdminResult = { ok: true; note?: string } | { ok: false; error: string; issues?: string[] };

export async function approveMockRequest(requestId: string): Promise<MockAdminResult> {
  return guarded("approve", async (adminId) => {
    const res = await approveRequest(requestId, adminId);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function rejectMockRequest(requestId: string): Promise<MockAdminResult> {
  return guarded("reject", async (adminId) => {
    const res = await rejectRequest(requestId, adminId);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function bulkApproveMockRequests(requestIds: string[]): Promise<{ ok: true; outcome: BulkOutcome } | { ok: false; error: string }> {
  return guarded("bulk approve", async (adminId) => {
    const outcome = await bulkApprove(requestIds, adminId);
    refreshAdmin();
    return { ok: true as const, outcome };
  });
}

export async function grantMockByEmail(email: string, mockId: string): Promise<MockAdminResult> {
  return guarded("grant", async (adminId) => {
    if (!email.trim()) return { ok: false, error: "Enter an email address." };
    if (!mockId) return { ok: false, error: "Pick a mock." };
    const res = await grantByEmail(email, mockId, adminId);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function cancelMockAttempt(attemptId: string): Promise<MockAdminResult> {
  return guarded("cancel", async () => {
    const res = await cancelAttempt(attemptId);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function saveMockDefinition(
  input: MockInput,
): Promise<{ ok: true; id: string; issues: string[] } | { ok: false; error: string; issues?: string[] }> {
  return guarded("save mock", async () => {
    const res = await saveMock(input);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function setMockPublishedAction(mockId: string, published: boolean): Promise<MockAdminResult> {
  return guarded("publish", async () => {
    const res = await setMockPublished(mockId, published);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function duplicateMockAction(mockId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return guarded("duplicate", async () => {
    const res = await duplicateMock(mockId);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function uploadMockTask1Image(formData: FormData): Promise<MockAdminResult> {
  return guarded("upload image", async () => {
    const mockId = String(formData.get("mockId") || "");
    const file = formData.get("file");
    if (!mockId) return { ok: false, error: "Save the mock first." };
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };
    const res = await uploadTask1Image(mockId, file);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function removeMockTask1Image(mockId: string): Promise<MockAdminResult> {
  return guarded("remove image", async () => {
    const res = await removeTask1Image(mockId);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function deleteMockDefinition(mockId: string): Promise<MockAdminResult> {
  return guarded("delete mock", async () => {
    const res = await deleteMock(mockId);
    if (res.ok) refreshAdmin();
    return res;
  });
}

export async function gradeMockWriting(
  attemptId: string,
  input: { task1: number; task2: number; writing: number | null; feedback: string },
): Promise<MockAdminResult> {
  return guarded("grade", async (adminId) => {
    const res = await gradeWriting(attemptId, input, adminId);
    if (res.ok) {
      refreshAdmin();
      revalidatePath(`/admin/mocks/attempts/${attemptId}`);
    }
    return res;
  });
}

export async function releaseMockAttempt(attemptId: string): Promise<MockAdminResult> {
  return guarded("release", async (adminId) => {
    const res = await releaseAttempt(attemptId, adminId);
    if (res.ok) {
      refreshAdmin();
      revalidatePath(`/admin/mocks/attempts/${attemptId}`);
    }
    return res;
  });
}

export async function bulkReleaseMockAttempts(attemptIds: string[]): Promise<{ ok: true; outcome: BulkOutcome } | { ok: false; error: string }> {
  return guarded("bulk release", async (adminId) => {
    const outcome = await bulkRelease(attemptIds, adminId);
    refreshAdmin();
    return { ok: true as const, outcome };
  });
}

export async function unreleaseMockAttempt(attemptId: string): Promise<MockAdminResult> {
  return guarded("unrelease", async () => {
    const res = await unreleaseAttempt(attemptId);
    if (res.ok) {
      refreshAdmin();
      revalidatePath(`/admin/mocks/attempts/${attemptId}`);
    }
    return res;
  });
}
