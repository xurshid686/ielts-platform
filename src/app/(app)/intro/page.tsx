import { requireLevel } from "@/lib/auth";
import { LevelSection } from "@/components/sections/level-section";

export const metadata = { title: "Introduction" };

export default async function IntroPage() {
  const profile = await requireLevel("intro");
  return <LevelSection level="intro" profile={profile} />;
}
