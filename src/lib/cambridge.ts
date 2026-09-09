import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rows } from "@/types/database";
import { MAX_REQUEST_MESSAGE, type RequestStatus } from "@/lib/cambridge-shared";

// The Cambridge section (migration 0049), in one place.
//
// AUTHORISATION-FREE ON PURPOSE, and gated by its callers — the same contract
// as createTestFromHtml(): the server actions in app/actions/cambridge.ts call
// assertAdmin() first, and the Telegram bot has already checked the owner's id
// before its handler runs. Do NOT call anything below from a place that has not
// gated.
//
// Why a library rather than the admin RPCs the rest of the site uses:
// grant_discipline / set_premium and friends all begin with
// `is_admin(auth.uid())`, and auth.uid() is NULL under the service role, so the
// Telegram bot cannot call them (CLAUDE.md, "The bot cannot call the admin
// RPCs"). Approving from a phone is the whole point of the Telegram
// notification, so the rule lives in TypeScript, once, and both doors use it.
//
// Every write here uses the service-role client because 0049 revokes
// INSERT/UPDATE/DELETE on both tables from anon and authenticated.

// Re-exported so server callers have one import for the whole feature; the
// definitions live in cambridge-shared.ts because the client needs them too.
export { MAX_REQUEST_MESSAGE };
export type { RequestStatus };

export type CambridgeRequestRow = {
  user_id: string;
  status: RequestStatus;
  message: string | null;
  created_at: string;
  decided_at: string | null;
};

/** A request joined to the student it belongs to, for the admin queue. */
export type CambridgeRequest = CambridgeRequestRow & {
  name: string | null;
  email: string | null;
};

export type CambridgeMember = {
  user_id: string;
  name: string | null;
  email: string | null;
  granted_at: string;
};

// ---------------------------------------------------------------- reading

/** Is this student approved? The one question the whole section turns on. */
export async function isCambridgeMember(userId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("cambridge_members")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** This student's own request, or null if they have never asked. */
export async function getRequestFor(userId: string): Promise<CambridgeRequestRow | null> {
  const { data } = await createAdminClient()
    .from("cambridge_requests")
    .select("user_id, status, message, created_at, decided_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as CambridgeRequestRow | null) ?? null;
}

/**
 * The admin queue.
 *
 * Two queries rather than a PostgREST embed: `cambridge_requests` has a foreign
 * key to `profiles`, but so does `decided_by`, which makes the implicit join
 * ambiguous. Named columns, never select("*").
 */
export async function listRequests(status?: RequestStatus): Promise<CambridgeRequest[]> {
  const db = createAdminClient();
  let q = db
    .from("cambridge_requests")
    .select("user_id, status, message, created_at, decided_at")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);

  const reqs = rows<CambridgeRequestRow>((await q).data);
  if (!reqs.length) return [];

  const { data: profs } = await db
    .from("profiles")
    .select("id, name, email")
    .in(
      "id",
      reqs.map((r) => r.user_id),
    );

  const who = new Map(
    rows<{ id: string; name: string | null; email: string | null }>(profs).map((p) => [p.id, p]),
  );

  return reqs.map((r) => ({
    ...r,
    name: who.get(r.user_id)?.name ?? null,
    email: who.get(r.user_id)?.email ?? null,
  }));
}

/** Drives the badge on /admin and the tab label. */
export async function countPending(): Promise<number> {
  const { count } = await createAdminClient()
    .from("cambridge_requests")
    .select("user_id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export async function listMembers(): Promise<CambridgeMember[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("cambridge_members")
    .select("user_id, granted_at")
    .order("granted_at", { ascending: false });

  const members = rows<{ user_id: string; granted_at: string }>(data);
  if (!members.length) return [];

  const { data: profs } = await db
    .from("profiles")
    .select("id, name, email")
    .in(
      "id",
      members.map((m) => m.user_id),
    );

  const who = new Map(
    rows<{ id: string; name: string | null; email: string | null }>(profs).map((p) => [p.id, p]),
  );

  return members.map((m) => ({
    user_id: m.user_id,
    granted_at: m.granted_at,
    name: who.get(m.user_id)?.name ?? null,
    email: who.get(m.user_id)?.email ?? null,
  }));
}

/** How many Cambridge papers exist, for the locked teaser's placeholder grid. */
export async function countCambridgeTests(): Promise<{ reading: number; listening: number }> {
  const { data } = await createAdminClient().from("tests").select("skill").eq("track", "cambridge");

  const list = rows<{ skill: string }>(data);
  return {
    reading: list.filter((t) => t.skill === "reading").length,
    listening: list.filter((t) => t.skill === "listening").length,
  };
}

// ---------------------------------------------------------------- writing

export type LibResult = { ok: true } | { ok: false; error: string };

/**
 * A student asks for access.
 *
 * Refuses an existing member (nothing to ask for) and an already-pending
 * request (the answer is "wait", and a second row would only be noise in the
 * owner's queue). A REJECTED request may be re-sent: a refusal is usually "not
 * yet", and the alternative is a student with no way to ask again.
 */
export async function submitRequest(userId: string, message: string): Promise<LibResult> {
  if (await isCambridgeMember(userId)) {
    return { ok: false, error: "You already have access to the Cambridge section." };
  }

  const existing = await getRequestFor(userId);
  if (existing?.status === "pending") {
    return { ok: false, error: "Your request is already waiting for approval." };
  }

  const note = message.trim().slice(0, MAX_REQUEST_MESSAGE);

  const { error } = await createAdminClient()
    .from("cambridge_requests")
    .upsert(
      {
        user_id: userId,
        status: "pending",
        message: note || null,
        created_at: new Date().toISOString(),
        decided_at: null,
        decided_by: null,
      },
      { onConflict: "user_id" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Approve: grant membership, stamp the request, tell the student.
 *
 * All three in ONE function so the web UI and the Telegram bot cannot drift —
 * an approval from the phone that forgot the notification would be a silent
 * grant nobody knew they had. The notification insert is best-effort: a student
 * who has access but no bell entry is a far smaller problem than a failed
 * approval.
 */
export async function approveRequest(userId: string, adminId: string | null): Promise<LibResult> {
  const db = createAdminClient();

  const { error: memberErr } = await db
    .from("cambridge_members")
    .upsert({ user_id: userId, granted_by: adminId }, { onConflict: "user_id" });
  if (memberErr) return { ok: false, error: memberErr.message };

  await db
    .from("cambridge_requests")
    .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: adminId })
    .eq("user_id", userId);

  const { error: noteErr } = await db.from("notifications").insert({
    user_id: userId,
    type: "cambridge_access",
    title: "Cambridge access approved",
    body: "You can now practise the Cambridge tests. Open the Cambridge section to start.",
    data: { href: "/cambridge" },
  });
  if (noteErr) console.error("[cambridge] approval notification failed", noteErr.message);

  return { ok: true };
}

export async function rejectRequest(userId: string, adminId: string | null): Promise<LibResult> {
  const { error } = await createAdminClient()
    .from("cambridge_requests")
    .update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: adminId })
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Look a student up by email, the way every admin RPC on this site is keyed. */
async function findByEmail(email: string): Promise<{ id: string } | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id")
    .ilike("email", email.trim())
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/** The owner adding a student directly, without waiting for them to ask. */
export async function grantCambridge(email: string, adminId: string | null): Promise<LibResult> {
  const target = await findByEmail(email);
  if (!target) return { ok: false, error: "No user found with that email." };
  return approveRequest(target.id, adminId);
}

/**
 * Take access away. The request history is KEPT — it is the record of what was
 * asked and answered, and deleting it would hide why the student ever had
 * access. Only the entitlement goes.
 */
export async function revokeCambridge(email: string): Promise<LibResult> {
  const target = await findByEmail(email);
  if (!target) return { ok: false, error: "No user found with that email." };
  return revokeCambridgeById(target.id);
}

export async function revokeCambridgeById(userId: string): Promise<LibResult> {
  const { error } = await createAdminClient()
    .from("cambridge_members")
    .delete()
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
