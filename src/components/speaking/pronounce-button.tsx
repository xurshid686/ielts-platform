"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";

/** Speaks a word aloud using the browser's built-in text-to-speech. */
export function PronounceButton({ word }: { word: string }) {
  const [speaking, setSpeaking] = useState(false);

  function speak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = "en-GB";
    utter.rate = 0.9;
    // Prefer a native English voice if one is available.
    const voices = window.speechSynthesis.getVoices();
    const enVoice =
      voices.find((v) => v.lang === "en-GB") ||
      voices.find((v) => v.lang.startsWith("en"));
    if (enVoice) utter.voice = enVoice;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`Hear "${word}"`}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:border-primary/60 hover:text-primary ${
        speaking ? "animate-pulse text-primary" : "text-muted"
      }`}
    >
      <Volume2 className="h-4 w-4" />
    </button>
  );
}
