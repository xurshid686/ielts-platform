import "./admin.css";
import { requireAdmin } from "@/lib/auth";
import { adminBadgeCounts } from "@/lib/admin/stats";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";
import { AdminTopbar } from "@/components/admin/shell/admin-topbar";

// Admin panel v2 (owner, 2026-11-27): its own full-screen shell. ChromeSwitch
// (components/chrome-switch.tsx) drops the student header on /admin/*, so this
// layout owns the whole viewport: a fixed ink sidebar with live counts of work
// waiting, and a slim top bar with student search.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin(); // redirects non-admins to /dashboard
  const badges = await adminBadgeCounts(me.is_owner);

  return (
    <div className="admin-theme min-h-screen">
      <AdminSidebar isOwner={me.is_owner} badges={badges} />
      <div className="lg:pl-60">
        <AdminTopbar name={me.name || me.email || "Admin"} role={me.is_owner ? "Owner" : "Admin"} />
        <main className="mx-auto w-full max-w-[1400px] px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
