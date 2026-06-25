import Link from "next/link";
import { ArrowLeft, Volume2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { PronounceButton } from "@/components/speaking/pronounce-button";
import { MISPRONOUNCED_WORDS } from "@/lib/ielts/mispronounced-words";

export const metadata = { title: "Commonly mispronounced words" };

export default async function PronunciationPage() {
  await requireProfile();

  const words = [...MISPRONOUNCED_WORDS].sort((a, b) =>
    a.word.localeCompare(b.word),
  );

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
              Tap the speaker to hear each word. {words.length} words and growing.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {words.map((w) => (
          <div
            key={w.word}
            className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <PronounceButton word={w.word} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{w.word}</span>
                <span className="text-xs text-muted">{w.ipa}</span>
              </div>
              <p className="mt-1 text-sm text-foreground/80">{w.tip}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted/70">
        Pronunciation uses your device&apos;s voice, so it may vary slightly by browser.
        More words will be added over time.
      </p>
    </div>
  );
}
