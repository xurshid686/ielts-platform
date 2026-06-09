"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

// Copies the current page URL (or a given one) to the clipboard.
export function ShareButton({ url, label = "Share" }: { url?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const link = url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user cancelled / unsupported */
    }
  }

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
    >
      {copied ? <Check className="h-4 w-4 text-success" /> : <Share2 className="h-4 w-4" />}
      {copied ? "Link copied" : label}
    </button>
  );
}
