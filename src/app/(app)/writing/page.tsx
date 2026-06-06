import { PenLine } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function WritingPage() {
  return (
    <ComingSoon
      icon={<PenLine className="h-6 w-6" />}
      title="Writing"
      desc="Task 1 & 2 prompts, a distraction-free editor, draft saving, and optional AI band-score feedback. Arriving in Phase 2."
    />
  );
}
