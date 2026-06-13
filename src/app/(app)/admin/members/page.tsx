import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminMembers } from "@/components/admin/admin-members";
import type { MemberRow } from "@/app/actions/admin";

export default async function AdminMembersPage() {
  await requireAdmin();
  const supabase = await createClient();

  // Include level (0021) + hidden_from_leaderboard (0020); fall back without
  // them if those migrations are pending so this page never hard-fails.
  let rows: Record<string, unknown>[] = [];
  for (const cols of [
    "id, email, name, role, level, premium_until, xp, hidden_from_leaderboard",
    "id, email, name, role, premium_until, xp, hidden_from_leaderboard",
    "id, email, name, role, premium_until, xp",
  ]) {
    const { data, error } = await supabase
      .from("profiles")
      .select(cols)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error) {
      rows = (data ?? []) as unknown as Record<string, unknown>[];
      break;
    }
    if (!/hidden_from_leaderboard|level/.test(error.message)) break;
  }

  const initialUsers = rows.map((u) => ({
    hidden_from_leaderboard: false,
    level: "regular",
    ...u,
  })) as unknown as MemberRow[];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold">Members &amp; premium</h1>
        <p className="text-muted">
          Search an account and grant Premium access for a set period. It expires
          automatically when the period ends.
        </p>
      </div>

      <AdminMembers initialUsers={initialUsers} />
    </div>
  );
}
