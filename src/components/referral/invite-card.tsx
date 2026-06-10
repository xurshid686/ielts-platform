"use client";

import { useState } from "react";
import { Copy, Check, Send, Share2 } from "lucide-react";

const SHARE_TEXT =
  "I'm prepping for IELTS on this app — real tests, instant band scores and a live AI examiner. Join with my link and we both get rewarded:";

export function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  // Built on the client so it always uses the real current origin.
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/register?ref=${code}`
      : `/register?ref=${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function nativeShare() {
    try {
      if (navigator.share) await navigator.share({ text: SHARE_TEXT, url: link });
      else await copy();
    } catch {
      /* user cancelled */
    }
  }

  const telegram = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    SHARE_TEXT,
  )}`;

  return (
    <div className="space-y-4">
      {/* The shareable link */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <span className="truncate text-sm text-muted">{link}</span>
        </div>
        <button
          onClick={copy}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition-all hover:brightness-110"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      {/* Share targets */}
      <div className="flex flex-wrap gap-2">
        <a
          href={telegram}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium shadow-soft transition-colors hover:bg-surface-2"
        >
          <Send className="h-4 w-4 text-[#229ED9]" /> Share on Telegram
        </a>
        <button
          onClick={nativeShare}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium shadow-soft transition-colors hover:bg-surface-2"
        >
          <Share2 className="h-4 w-4" /> More…
        </button>
      </div>

      <p className="text-xs text-muted">
        Your code: <span className="font-mono font-semibold tracking-wider text-foreground">{code}</span>
      </p>
    </div>
  );
}
