"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  adminChangeBuyer,
  adminGrantFriends,
  adminRemoveFriend,
  adminRenameGroup,
  adminSetGroupHidden,
} from "@/app/actions/admin-friends";
import { GRANT_PERIODS } from "@/lib/site";

type Member = { id: string; name: string; is_owner: boolean };

/** One group's controls on /admin/groups (0078): rename, extend, hide, change buyer, remove. */
export function GroupRowActions({
  groupId,
  ownerId,
  name,
  customName,
  hidden,
  members,
}: {
  groupId: string;
  ownerId: string;
  name: string;
  customName: boolean;
  hidden: boolean;
  members: Member[];
}) {
  const router = useRouter();
  const path = usePathname() ?? "/admin/groups";
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState(customName ? name : "");
  const [months, setMonths] = useState(1);
  const [picked, setPicked] = useState(members.find((m) => !m.is_owner)?.id ?? ownerId);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(r);
      if (r.ok) start(() => router.refresh());
    } catch {
      setMsg({ ok: false, text: "The server did not answer." });
    } finally {
      setBusy(null);
    }
  };
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50";
  const spin = (k: string) => (busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null);

  return (
    <div className="space-y-2 text-[13px]">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("name", () => adminRenameGroup(groupId, newName, path));
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={name}
          maxLength={30}
          aria-label="Group name"
          className="h-8 w-48 rounded-md border border-border bg-surface px-2"
        />
        <button className={btn} disabled={!!busy}>
          {spin("name")} Rename
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-surface px-2"
          aria-label="Extend by"
        >
          {GRANT_PERIODS.map((g) => (
            <option key={g.months} value={g.months}>
              + {g.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("ext", () => adminGrantFriends(ownerId, months))}
        >
          {spin("ext")} Extend
        </button>
        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() => run("hide", () => adminSetGroupHidden(groupId, !hidden))}
        >
          {spin("hide")} {hidden ? "Show on leaderboard" : "Hide from leaderboard"}
        </button>
      </div>
      {members.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="h-8 max-w-48 rounded-md border border-border bg-surface px-2"
            aria-label="Member"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.is_owner ? " (buyer)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btn}
            disabled={!!busy || picked === ownerId}
            onClick={() => {
              if (!window.confirm("Make this member the buyer? They will control invitations and the name.")) return;
              void run("own", () => adminChangeBuyer(groupId, picked));
            }}
          >
            {spin("own")} Make buyer
          </button>
          <button
            type="button"
            className={`${btn} text-danger`}
            disabled={!!busy || picked === ownerId}
            onClick={() => {
              if (!window.confirm("Remove this member? Their group Premium ends.")) return;
              void run("rm", () => adminRemoveFriend(picked, path));
            }}
          >
            {spin("rm")} Remove
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className={msg.ok ? "text-success" : "text-danger"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
