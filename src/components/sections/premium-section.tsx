"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Crown,
  Lock,
  Layers,
  FileText,
  ArrowRight,
  Sparkles,
  Zap,
  Loader2,
  Check,
} from "lucide-react";
import type { BrowserItem } from "@/components/sections/test-browser";
import { unlockCost } from "@/lib/premium";
import { unlockTest } from "@/app/actions/unlock";

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export function PremiumSection({
  items,
  skill,
  canAccess,
  unlockedIds,
  xp: initialXp,
}: {
  items: BrowserItem[];
  skill: "reading" | "listening";
  canAccess: boolean;
  unlockedIds: string[];
  xp: number;
}) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [unlocked, setUnlocked] = useState(() => new Set(unlockedIds));
  const [xp, setXp] = useState(initialXp);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function unlock(id: string) {
    setBusyId(id);
    setError(null);
    const res = await unlockTest(id);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUnlocked((prev) => new Set(prev).add(id));
    setXp(res.xp);
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-surface to-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-sm">
            <Crown className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Premium materials</h2>
            <p className="text-sm text-muted">
              {canAccess
                ? "Exclusive tests included with your membership."
                : "Included with Premium — or unlock one at a time with XP."}
            </p>
          </div>
        </div>
        {!canAccess && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <Zap className="h-4 w-4" /> {xp} XP
          </span>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => {
          const isUnlocked = unlocked.has(t.id);
          const accessible = canAccess || isUnlocked;
          const isNew = now - new Date(t.createdAt).getTime() < NEW_WINDOW_MS;
          const cost = unlockCost(t);

          const head = (
            <div className="flex items-start justify-between">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                {t.kind === "full" ? <Layers className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                {!accessible && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white">
                    <Lock className="h-2.5 w-2.5" />
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {isNew && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                    <Sparkles className="h-3 w-3" /> NEW
                  </span>
                )}
                {isUnlocked && !canAccess && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                    <Check className="h-3 w-3" /> Unlocked
                  </span>
                )}
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  {t.kind === "full"
                    ? "Full test"
                    : skill === "reading"
                      ? t.passage
                        ? `Passage ${t.passage}`
                        : "Passage"
                      : "Section"}
                </span>
              </div>
            </div>
          );

          const body = (
            <>
              <h3 className="mt-3 font-semibold leading-snug">{t.title}</h3>
              {t.questionTypes.length > 0 && (
                <p className="mt-1 line-clamp-1 text-xs text-muted">
                  {t.questionTypes.join(" · ")}
                </p>
              )}
            </>
          );

          // Accessible → open the test.
          if (accessible) {
            return (
              <Link key={t.id} href={`/${skill}/${t.id}`} className="group">
                <div className="flex h-full flex-col rounded-2xl border border-amber-500/20 bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/50 hover:shadow-elevated">
                  {head}
                  {body}
                  <div className="mt-3 flex items-center justify-between text-sm text-muted">
                    <span className="tabular-nums">
                      {t.attempts
                        ? `${t.attempts} attempt${t.attempts > 1 ? "s" : ""}${
                            t.best != null ? ` · best ${t.best}` : ""
                          }`
                        : "Open test"}
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
                  </div>
                </div>
              </Link>
            );
          }

          // Locked → unlock with XP.
          const affordable = xp >= cost;
          return (
            <div
              key={t.id}
              className="flex h-full flex-col rounded-2xl border border-amber-500/20 bg-surface p-5 shadow-soft"
            >
              {head}
              {body}
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 dark:text-amber-400">
                  <Zap className="h-4 w-4" /> {cost} XP
                </span>
                <button
                  onClick={() => unlock(t.id)}
                  disabled={busyId === t.id || !affordable}
                  title={affordable ? "Unlock with XP" : `You need ${cost} XP`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === t.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  {affordable ? "Unlock" : "Need XP"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
