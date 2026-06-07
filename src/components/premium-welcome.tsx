"use client";

import { useState } from "react";
import { Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissPremiumAnnounce } from "@/app/actions/profile";

// One-time congratulations shown the next time a newly-promoted member enters
// the app. Dismissing clears the flag so it won't show again.
export function PremiumWelcome({
  show,
  until,
}: {
  show: boolean;
  until: string | null;
}) {
  const [open, setOpen] = useState(show);
  if (!open) return null;

  function close() {
    setOpen(false);
    void dismissPremiumAnnounce();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-amber-500/30 bg-surface text-center shadow-elevated">
        <div className="bg-gradient-to-br from-amber-400 to-yellow-500 px-6 py-8 text-white">
          <button
            onClick={close}
            className="absolute right-3 top-3 text-white/80 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-3xl">
            👑
          </div>
          <h2 className="mt-4 text-2xl font-extrabold">Congratulations!</h2>
          <p className="mt-1 text-sm text-white/90">You&apos;re now a Premium member</p>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted">
            You&apos;ve unlocked all Premium reading &amp; listening materials
            {until ? (
              <>
                {" "}
                until <strong className="text-foreground">{new Date(until).toLocaleDateString()}</strong>
              </>
            ) : null}
            . Enjoy your practice! 🎉
          </p>
          <Button className="mt-5 w-full" onClick={close}>
            <Crown className="h-4 w-4" /> Let&apos;s go
          </Button>
        </div>
      </div>
    </div>
  );
}
