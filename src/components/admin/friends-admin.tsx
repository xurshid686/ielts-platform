"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { adminGrantFriends, adminRemoveFriend } from "@/app/actions/admin-friends";
import { GRANT_PERIODS } from "@/lib/site";

type Member = { id: string; name: string; is_owner: boolean };

/**
 * Student 360 → Friends group (0077). Grant creates the group with this student
 * as organiser (or extends it); members can be removed, never the organiser.
 */
export function FriendsAdmin({
  studentId,
  role,
  members,
}: {
  studentId: string;
  /** "organiser" | "member" | "none": a member can't organise a second group. */
  role: "organiser" | "member" | "none";
  members: Member[];
}) {
  const router = useRouter();
  const path = usePathname() ?? "";
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startRefresh] = useTransition();

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

  return (
    <div className="space-y-3 text-[13px]">
      {role !== "member" && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-surface px-2"
            aria-label="Friends period"
          >
            {GRANT_PERIODS.map((g) => (
              <option key={g.months} value={g.months}>
                + {g.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("grant", () => adminGrantFriends(studentId, months))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "grant" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {role === "organiser" ? "Extend group" : "Create group"}
          </button>
        </div>
      )}

      {members.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <a href={`/admin/members/${m.id}`} className="truncate hover:underline">
                {m.name}
                {m.is_owner && <span className="ml-1.5 text-xs text-premium">organiser</span>}
              </a>
              {!m.is_owner && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    if (!window.confirm(`Remove ${m.name} from the group? Their Premium date stays as it is.`)) return;
                    void run(`rm-${m.id}`, () => adminRemoveFriend(m.id, path));
                  }}
                  className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                >
                  {busy === `rm-${m.id}` ? "Removing…" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <p role="status" className={msg.ok ? "text-success" : "text-danger"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
