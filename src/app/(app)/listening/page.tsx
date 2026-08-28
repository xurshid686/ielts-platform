import { SkillSection } from "@/components/sections/skill-section";

export const metadata = {
  title: "Free IELTS Listening Practice Tests",
  description:
    "Free IELTS Listening tests with real exam audio, marked automatically the moment you submit, with answers and explanations.",
  alternates: { canonical: "/listening" },
};

export default function ListeningPage() {
  return <SkillSection skill="listening" />;
}
