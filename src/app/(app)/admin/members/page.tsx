import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminMembers } from "@/components/admin/admin-members";
import type { MemberRow } from "@/app/actions/admin";
import { rows } from "@/types/database";

export default async function AdminMembersPage() {
  await requireAdmin();
  const supabase = await createClient();

  // `level` (0021) and `hidden_from_leaderboard` (0020) are long applied.
  const COLUMNS =
    "id, email, name, role, level, premium_until, xp, hidden_from_leaderboard, last_activity_date";

  // The newest 500 accounts, PLUS everyone who has ever held Premium. Without
  // the second query a lapsed member who registered long ago falls outside the
  // first 500 and the "Lapsed" filter would silently miss them.
  const [{ data }, { data: everPremium }] = await Promise.all([
    supabase.from("profiles").select(COLUMNS).order("created_at", { ascending: false }).limit(500),
    supabase
      .from("profiles")
      .select(COLUMNS)
      .not("premium_until", "is", null)
      .order("premium_until", { ascending: false })
      .limit(1000),
  ]);

  const recent = rows<MemberRow>(data);
  const seen = new Set(recent.map((u) => u.id));
  const initialUsers = [
    ...recent,
    ...rows<MemberRow>(everPremium).filter((u) => !seen.has(u.id)),
  ];

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
