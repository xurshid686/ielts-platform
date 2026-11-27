import "./admin.css";
import { requireAdmin } from "@/lib/auth";
import { adminBadgeCounts } from "@/lib/admin/stats";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";

// Admin panel v2.1 (owner, 2026-11-27: v2 "feels like another website").
// The site header stays on /admin (ChromeSwitch only drops the capped-width
// <main>), and the panel uses the site's own warm tokens. This layout adds a
// sidebar under the header with live counts of work waiting.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin(); // redirects non-admins to /dashboard
  const badges = await adminBadgeCounts(me.is_owner);

  return (
    <div className="admin-theme flex flex-1 flex-col lg:flex-row">
      <AdminSidebar isOwner={me.is_owner} badges={badges} />
      <main className="admin-main mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
