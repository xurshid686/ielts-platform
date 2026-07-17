"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Globe, Lock } from "lucide-react";
import { setTestPublic } from "@/app/actions/admin";

export function PublicToggleButton({ id, isPublic }: { id: string; isPublic: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function toggle() {
    start(async () => {
      const res = await setTestPublic(id, !isPublic);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  async function copyLink() {
    try {
      const url = `${window.location.origin}/practice/${id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="flex items-center gap-2">
      {isPublic && (
        <button
          onClick={copyLink}
          title="Copy public link"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      )}
      <button
        onClick={toggle}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50 ${
          isPublic
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-border text-muted hover:bg-surface-2"
        }`}
      >
        {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {pending ? "Saving…" : isPublic ? "Public" : "Make public"}
      </button>
    </div>
  );
}
