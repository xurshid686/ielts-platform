import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { MaterialsManager } from "@/components/admin/materials-manager";
import type { Material } from "@/types/database";

export const metadata = { title: "Learning materials" };

export default async function AdminMaterialsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("materials")
    .select("*")
    .order("level", { ascending: true })
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });

  const materials = (data ?? []) as Material[];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold">Learning materials</h1>
        <p className="text-muted">
          Upload files or links for your Pre-IELTS and Introduction students. Each appears only
          in that level&apos;s menu.
        </p>
      </div>

      <MaterialsManager initial={materials} />
    </div>
  );
}
