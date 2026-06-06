import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminTeam } from "@/components/admin/admin-team";
import type { Profile } from "@/types/database";

export default async function AdminTeamPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  const admins = ((data ?? []) as Pick<Profile, "id" | "email" | "name">[]).map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold">Manage admins</h1>
        <p className="text-muted">
          Grant or revoke admin access by email. New admins are notified automatically.
        </p>
      </div>

      <AdminTeam admins={admins} selfId={me.id} />
    </div>
  );
}
