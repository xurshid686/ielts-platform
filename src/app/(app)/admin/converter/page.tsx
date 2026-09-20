import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { listJobs } from "@/lib/converter";
import { AdminConverter } from "@/components/admin/admin-converter";

// Owner-only. The admin layout already calls requireAdmin(); this adds the
// owner check, the same way /admin/team does. Both matter: the page gate keeps
// the link from being useful to another admin, and app/actions/converter.ts
// gates every action independently, because an action is reachable without the
// page.
export default async function AdminConverterPage() {
  const me = await requireOwner();
  const jobs = await listJobs(25);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">PDF → CDI converter</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Upload a reading PDF. A worker on your machine builds the player, runs
          every gate, and sends it back here. Nothing is published until you
          press Publish.
        </p>
      </div>

      <AdminConverter jobs={jobs} selfId={me.id} />
    </div>
  );
}
