"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Crown, Gem, Zap, Eye, EyeOff, GraduationCap, FileDown, ImageOff, Loader2 } from "lucide-react";
import {
  setPremium,
  setUltima,
  giftXp,
  setLeaderboardHidden,
  setUserLevel,
  removeUserAvatar,
} from "@/app/actions/admin";
import { adminSendWeeklyReport } from "@/app/actions/reports";
import { ALL_LEVELS } from "@/lib/levels";
import { GRANT_PERIODS } from "@/lib/site";
import { cn } from "@/lib/utils";

// The Student 360 actions. Every button calls the SAME server action the bulk
// Members screen uses (each re-checks assertAdmin), then refreshes the page so
// the header chips show the new state. No new privileged writes.

type Props = {
  id: string;
  email: string | null;
  name: string | null;
  level: string;
  hidden: boolean;
  hasAvatar: boolean;
  premiumActive: boolean;
  ultimaActive: boolean;
};

export function StudentActions(p: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [months, setMonths] = useState(1);
  const [ultimaMonths, setUltimaMonths] = useState(1);
  const [xp, setXp] = useState(100);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(r);
      if (r.ok) startRefresh(() => router.refresh());
    } catch {
      setMsg({ ok: false, text: "The server did not answer. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const email = p.email;
  const disabled = !!busy || refreshing;
  const who = p.name || p.email || "this student";

  if (!email) return <p className="text-[13px] text-muted">This account has no email, so it cannot be managed here.</p>;

  return (
    <div className="space-y-4 text-[13px]">
      <Row icon={<Crown className="h-4 w-4 text-premium" />} label="Premium">
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-surface px-2"
          aria-label="Premium period"
        >
          {GRANT_PERIODS.map((g) => (
            <option key={g.months} value={g.months}>
              + {g.label}
            </option>
          ))}
        </select>
        <Btn
          busy={busy === "premium"}
          disabled={disabled}
          onClick={() =>
            run("premium", async () => {
              const r = await setPremium(email, months);
              return r.ok
                ? { ok: true, text: `Premium until ${r.premium_until?.slice(0, 10)}.` }
                : { ok: false, text: r.error };
            })
          }
        >
          Grant
        </Btn>
        {p.premiumActive && (
          <Btn
            tone="danger"
            busy={busy === "premium-off"}
            disabled={disabled}
            onClick={() => {
              if (!window.confirm(`Remove Premium from ${who}? It ends now.`)) return;
              void run("premium-off", async () => {
                const r = await setPremium(email, 0);
                return r.ok ? { ok: true, text: "Premium removed." } : { ok: false, text: r.error };
              });
            }}
          >
            Revoke
          </Btn>
        )}
      </Row>

      <Row icon={<Gem className="h-4 w-4 text-premium" />} label="Ultima">
        <select
          value={ultimaMonths}
          onChange={(e) => setUltimaMonths(Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-surface px-2"
          aria-label="Ultima period"
        >
          {GRANT_PERIODS.map((g) => (
            <option key={g.months} value={g.months}>
              + {g.label}
            </option>
          ))}
        </select>
        <Btn
          busy={busy === "ultima"}
          disabled={disabled}
          onClick={() =>
            run("ultima", async () => {
              const r = await setUltima(email, ultimaMonths);
              return r.ok
                ? { ok: true, text: `Ultima until ${r.ultima_until?.slice(0, 10)} (Premium extended too).` }
                : { ok: false, text: r.error };
            })
          }
        >
          Grant
        </Btn>
        {p.ultimaActive && (
          <Btn
            tone="danger"
            busy={busy === "ultima-off"}
            disabled={disabled}
            onClick={() => {
              if (!window.confirm(`Remove Ultima from ${who}?`)) return;
              void run("ultima-off", async () => {
                const r = await setUltima(email, 0);
                return r.ok ? { ok: true, text: "Ultima removed." } : { ok: false, text: r.error };
              });
            }}
          >
            Revoke
          </Btn>
        )}
      </Row>

      <Row icon={<Zap className="h-4 w-4 text-warning" />} label="Gift XP">
        <input
          type="number"
          min={1}
          max={5000}
          value={xp}
          onChange={(e) => setXp(Number(e.target.value))}
          className="h-8 w-24 rounded-md border border-border bg-surface px-2 tabular-nums"
          aria-label="XP amount"
        />
        <Btn
          busy={busy === "xp"}
          disabled={disabled || !(xp > 0)}
          onClick={() =>
            run("xp", async () => {
              const r = await giftXp(email, xp);
              return r.ok ? { ok: true, text: `Gifted ${xp} XP (now ${r.xp}).` } : { ok: false, text: r.error };
            })
          }
        >
          Gift
        </Btn>
      </Row>

      <Row icon={<GraduationCap className="h-4 w-4 text-primary" />} label="Level">
        <select
          defaultValue={p.level}
          disabled={disabled}
          onChange={(e) => {
            const level = e.target.value;
            void run("level", async () => {
              const r = await setUserLevel(email, level);
              return r.ok ? { ok: true, text: "Level changed." } : { ok: false, text: r.error };
            });
          }}
          className="h-8 rounded-md border border-border bg-surface px-2"
          aria-label="Level"
        >
          {ALL_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        {busy === "level" && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      </Row>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Btn
          busy={busy === "hide"}
          disabled={disabled}
          onClick={() =>
            run("hide", async () => {
              const r = await setLeaderboardHidden(email, !p.hidden);
              return r.ok
                ? { ok: true, text: r.hidden ? "Hidden from the leaderboard." : "Back on the leaderboard." }
                : { ok: false, text: r.error };
            })
          }
        >
          {p.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {p.hidden ? "Show on leaderboard" : "Hide from leaderboard"}
        </Btn>
        <Btn
          busy={busy === "report"}
          disabled={disabled}
          onClick={() =>
            run("report", async () => {
              const r = await adminSendWeeklyReport(p.id);
              return r.ok ? { ok: true, text: "Weekly report sent to their inbox." } : { ok: false, text: r.error };
            })
          }
        >
          <FileDown className="h-3.5 w-3.5" /> Send weekly report
        </Btn>
        {p.hasAvatar && (
          <Btn
            tone="danger"
            busy={busy === "photo"}
            disabled={disabled}
            onClick={() => {
              if (!window.confirm(`Remove ${who}'s profile photo?`)) return;
              void run("photo", async () => {
                const r = await removeUserAvatar(p.id);
                return r.ok ? { ok: true, text: "Photo removed." } : { ok: false, text: r.error };
              });
            }}
          >
            <ImageOff className="h-3.5 w-3.5" /> Remove photo
          </Btn>
        )}
      </div>

      {msg && (
        <p role="status" className={cn("rounded-md px-3 py-2 text-xs", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex w-24 items-center gap-1.5 font-medium">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  busy,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium disabled:opacity-50",
        tone === "danger"
          ? "border-danger/30 text-danger hover:bg-danger/10"
          : "border-border bg-surface hover:border-primary/40 hover:text-primary",
      )}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
