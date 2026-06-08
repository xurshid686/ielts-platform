import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminMembers } from "@/components/admin/admin-members";
import type { MemberRow } from "@/app/actions/admin";

export default async function AdminMembersPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, name, role, premium_until, xp")
    .order("created_at", { ascending: false })
    .limit(20);

  const initialUsers = (data ?? []) as MemberRow[];

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
