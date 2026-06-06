import { Mic } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function SpeakingPage() {
  return (
    <ComingSoon
      icon={<Mic className="h-6 w-6" />}
      title="Speaking"
      desc="IELTS speaking prompts, in-browser microphone recording, upload, and optional AI fluency feedback. Arriving in Phase 2."
    />
  );
}
