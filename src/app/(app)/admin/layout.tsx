import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // redirects non-admins to /dashboard
  return <>{children}</>;
}
