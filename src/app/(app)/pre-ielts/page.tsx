import { GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireLevel } from "@/lib/auth";
import { LEVELS } from "@/lib/levels";
import { MaterialsView } from "@/components/materials/materials-view";
import type { Material } from "@/types/database";

export const metadata = { title: "Pre-IELTS" };

export default async function PreIeltsPage() {
  await requireLevel("pre_ielts");
  const supabase = await createClient();
  const meta = LEVELS.pre_ielts;

  const { data } = await supabase
    .from("materials")
    .select("*")
    .eq("level", "pre_ielts")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });

  const materials = (data ?? []) as Material[];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{meta.label}</h1>
          <p className="text-muted">{meta.blurb}</p>
        </div>
      </div>

      <MaterialsView materials={materials} />
    </div>
  );
}
