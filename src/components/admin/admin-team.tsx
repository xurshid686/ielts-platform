"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldX, UserPlus, Loader2, Mail, MailX } from "lucide-react";
import { setUserRole } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";

type Admin = { id: string; email: string | null; name: string | null };

export function AdminTeam({ admins, selfId }: { admins: Admin[]; selfId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // 'promote' | a user id (revoke)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function promote(e: React.FormEvent) {
    e.preventDefault();
    setBusy("promote");
    setMsg(null);
    const res = await setUserRole(email, "admin");
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({
      ok: true,
      text: res.emailed
        ? `${res.email} is now an admin — a notification email was sent.`
        : `${res.email} is now an admin. (Email not sent: ${res.emailNote ?? "email not configured"})`,
    });
    setEmail("");
    router.refresh();
  }

  async function revoke(a: Admin) {
    if (!a.email) return;
    setBusy(a.id);
    setMsg(null);
    const res = await setUserRole(a.email, "student");
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setMsg({ ok: true, text: `Removed admin access from ${a.email}.` });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Promote by email */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="flex items-center gap-2 font-semibold">
          <UserPlus className="h-5 w-5 text-primary" /> Promote a user to admin
        </h2>
        <p className="mt-1 text-sm text-muted">
          Enter the email of someone who already has an account. They&apos;ll get admin
          access immediately and an email letting them know.
        </p>
        <form onSubmit={promote} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="h-10 flex-1 rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-ring/30"
          />
          <Button type="submit" disabled={busy === "promote"}>
            {busy === "promote" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Promote to admin
          </Button>
        </form>
        {msg && (
          <p
            className={`mt-3 flex items-center gap-1.5 text-sm ${
              msg.ok ? "text-success" : "text-danger"
            }`}
          >
            {msg.ok ? <Mail className="h-4 w-4" /> : <MailX className="h-4 w-4" />}
            {msg.text}
          </p>
        )}
      </div>

      {/* Current admins */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Current admins ({admins.length})</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          <ul className="divide-y divide-border">
            {admins.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                    {(a.name || a.email || "A").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.name || a.email}
                      {a.id === selfId && (
                        <span className="ml-2 text-xs text-muted">(you)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">{a.email}</p>
                  </div>
                </div>
                {a.id === selfId ? (
                  <span className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
                    Owner
                  </span>
                ) : (
                  <button
                    onClick={() => revoke(a)}
                    disabled={busy === a.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    {busy === a.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldX className="h-3.5 w-3.5" />
                    )}
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
