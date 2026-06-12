import { requireLevel } from "@/lib/auth";
import { LevelSection } from "@/components/sections/level-section";

export const metadata = { title: "Pre-IELTS" };

export default async function PreIeltsPage() {
  const profile = await requireLevel("pre_ielts");
  return <LevelSection level="pre_ielts" profile={profile} />;
}
