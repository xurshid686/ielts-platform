import Link from "next/link";
import { ArrowLeft, Volume2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Commonly mispronounced words" };

export default async function PronunciationPage() {
  await requireProfile();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/speaking"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Speaking
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Volume2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Commonly mispronounced words</h1>
            <p className="text-sm text-muted">
              Words learners often get wrong — with the correct pronunciation.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
        This section is coming soon — it will be updated with a growing list of
        commonly mispronounced words and how to say them correctly.
      </div>
    </div>
  );
}
