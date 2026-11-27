"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";

/** The organiser's invite link with Copy and Share-on-Telegram. */
export function InviteLink({ url, ownerName }: { url: string; ownerName: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${ownerName} invites you to MockOnline Premium. Join my Friends group:`;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-mono text-sm"
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <a
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <Send className="h-4 w-4" /> Share on Telegram
      </a>
    </div>
  );
}
