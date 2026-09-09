import { createAdminClient } from "@/lib/supabase/admin";
import { listRequests, listMembers } from "@/lib/cambridge";
import { rows } from "@/types/database";
import {
  AdminCambridge,
  type CambridgeTestRow,
} from "@/components/admin/admin-cambridge";

// Gated by admin/layout.tsx (requireAdmin) and by /admin being in PROTECTED in
// src/proxy.ts. The actions this page calls re-check with their own
// assertAdmin(), so a stale page cannot be used to act.

export default async function AdminCambridgePage() {
  const [requests, members, testRes] = await Promise.all([
    listRequests(),
    listMembers(),
    createAdminClient()
      .from("tests")
      .select("id, title, skill, created_at")
      .eq("track", "cambridge")
      .order("created_at", { ascending: false }),
  ]);

  const tests = rows<CambridgeTestRow>(testRes.data);
  const pending = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cambridge</h1>
        <p className="text-muted">
          {pending > 0
            ? `${pending} student${pending === 1 ? "" : "s"} waiting for access.`
            : "Approve who may practise the Cambridge papers."}
        </p>
      </div>

      <AdminCambridge requests={requests} members={members} tests={tests} />
    </div>
  );
}
