import { SkillSection } from "@/components/sections/skill-section";

export const metadata = {
  title: "Free IELTS Reading Practice Tests",
  description:
    "Free IELTS Reading tests in the real computer-delivered exam format. Instant band scores, answers and explanations — no account needed to start.",
  alternates: { canonical: "/reading" },
};

export default function ReadingPage() {
  return <SkillSection skill="reading" />;
}
