"use client";

import { useState } from "react";
import { Search, Crown, Loader2, X, Zap, BarChart3 } from "lucide-react";
import { searchUsers, setPremium, giftXp, type MemberRow } from "@/app/actions/admin";
import { adminSendWeeklyReport } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { isPremiumActive } from "@/lib/premium";

const PERIODS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
];

export function AdminMembers({ initialUsers }: { initialUsers: MemberRow[] }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<MemberRow[]>(initialUsers);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [months, setMonths] = useState<Record<string, number>>({});
  const [giftBusyId, setGiftBusyId] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState<Record<string, number>>({});
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setSearching(true);
    setMsg(null);
    const res = await searchUsers(query);
    setSearching(false);
    if (res.ok) setUsers(res.users);
    else setMsg({ ok: false, text: res.error });
  }

  async function grant(u: MemberRow, m: number) {
    if (!u.email) return;
    setBusyId(u.id);
    setMsg(null);
    const res = await setPremium(u.email, m);
    setBusyId(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, premium_until: res.premium_until } : x)),
    );
    setMsg({
      ok: true,
      text: res.premium_until
        ? `${res.email} is Premium until ${new Date(res.premium_until).toLocaleDateString()}.`
        : `Premium removed from ${res.email}.`,
    });
  }

  async function gift(u: MemberRow) {
    if (!u.email) return;
    const amount = giftAmount[u.id] ?? 100;
    if (!amount) return;
    setGiftBusyId(u.id);
    setMsg(null);
    const res = await giftXp(u.email, amount);
    setGiftBusyId(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, xp: res.xp } : x)));
    setMsg({ ok: true, text: `Gifted ${amount} XP to ${res.email} (now ${res.xp} XP).` });
  }

  async function sendReport(u: MemberRow) {
    setReportBusyId(u.id);
    setMsg(null);
    const res = await adminSendWeeklyReport(u.id);
    setReportBusyId(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({
      ok: true,
      text: `Weekly report sent to ${u.name || u.email} (${res.tests} test${
        res.tests === 1 ? "" : "s"
      }${res.avgBand != null ? `, avg band ${res.avgBand}` : ""}).`,
    });
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search account by email or name…"
            className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-sm shadow-soft outline-none focus:border-primary/40 focus:ring-2 focus:ring-ring/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </form>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>
      )}

      {/* Results */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        {users.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No accounts found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => {
              const premium = isPremiumActive(u);
              const m = months[u.id] ?? 1;
              return (
                <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                      {(u.name || u.email || "U").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {u.name || u.email}
                        {premium && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <Crown className="h-2.5 w-2.5" /> Premium
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {u.email} · {u.xp} XP
                        {premium && u.premium_until
                          ? ` · until ${new Date(u.premium_until).toLocaleDateString()}`
                          : " · Free"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Premium */}
                    <select
                      value={m}
                      onChange={(e) =>
                        setMonths((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))
                      }
                      className="h-9 rounded-lg border border-border bg-surface-2 px-2 text-sm outline-none focus:border-primary/40"
                    >
                      {PERIODS.map((p) => (
                        <option key={p.months} value={p.months}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => grant(u, m)} disabled={busyId === u.id}>
                      {busyId === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Crown className="h-3.5 w-3.5" />
                      )}
                      {premium ? "Extend" : "Grant"}
                    </Button>
                    {premium && (
                      <button
                        onClick={() => grant(u, 0)}
                        disabled={busyId === u.id}
                        className="rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}

                    <span className="mx-1 hidden h-6 w-px bg-border sm:block" />

                    {/* Gift XP */}
                    <input
                      type="number"
                      value={giftAmount[u.id] ?? 100}
                      step={50}
                      onChange={(e) =>
                        setGiftAmount((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))
                      }
                      className="h-9 w-20 rounded-lg border border-border bg-surface-2 px-2 text-sm outline-none focus:border-primary/40"
                      aria-label="XP amount"
                    />
                    <button
                      onClick={() => gift(u)}
                      disabled={giftBusyId === u.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-sm font-medium text-amber-600 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
                    >
                      {giftBusyId === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      Gift XP
                    </button>

                    <span className="mx-1 hidden h-6 w-px bg-border sm:block" />

                    {/* Weekly report — admins can send any day (the "second chance") */}
                    <button
                      onClick={() => sendReport(u)}
                      disabled={reportBusyId === u.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Send this user their weekly progress report now"
                    >
                      {reportBusyId === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <BarChart3 className="h-3.5 w-3.5" />
                      )}
                      Send report
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
