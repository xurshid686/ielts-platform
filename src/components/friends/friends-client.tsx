"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, Check, Loader2, LogOut, Pencil, Search, UserMinus, UserPlus, X } from "lucide-react";
import {
  cancelInvite,
  findInvitable,
  inviteFriend,
  leaveFriendsGroup,
  nudgeFriend,
  removeInactiveMember,
  renameFriendsGroup,
  respondInvite,
  saveFriendsPrivacy,
} from "@/app/actions/friends";
import type { InviteCandidate } from "@/lib/friends";
import { cn } from "@/lib/utils";

type Msg = { ok: boolean; text: string } | null;

/** Runs an action, shows its message, refreshes the server page on success. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [, start] = useTransition();
  const run = async (key: string, fn: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(r);
      if (r.ok) start(() => router.refresh());
    } catch {
      setMsg({ ok: false, text: "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, run, setMsg };
}

function Note({ msg, className }: { msg: Msg; className?: string }) {
  if (!msg) return null;
  return (
    <p role="status" className={cn("text-sm", msg.ok ? "text-success" : "text-danger", className)}>
      {msg.text}
    </p>
  );
}

// ------------------------------------------------------------------ name

export function GroupName({ groupId, name, canRename }: { groupId: string; name: string; canRename: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const { busy, msg, run } = useAction();

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
        {canRename && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="Rename group"
          >
            <Pencil className="h-4 w-4" /> Rename
          </button>
        )}
        <Note msg={msg} className="w-full" />
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run("name", async () => {
          const r = await renameFriendsGroup(groupId, value);
          if (r.ok) setEditing(false);
          return r;
        });
      }}
    >
      <input
        autoFocus
        value={value}
        maxLength={30}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Group name"
        className="h-11 w-72 max-w-full rounded-xl border border-border bg-background px-3 text-lg font-semibold"
      />
      <button
        type="submit"
        disabled={busy === "name"}
        className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy === "name" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setValue(name);
        }}
        className="h-11 rounded-xl px-3 text-sm text-muted hover:bg-surface-2"
      >
        Cancel
      </button>
      <p className="w-full text-xs text-muted">2–30 characters. Shown on the group leaderboard. Leave empty for the default.</p>
      <Note msg={msg} className="w-full" />
    </form>
  );
}

// ------------------------------------------------------------------ invite search

export function InviteSearch({ disabled }: { disabled: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<InviteCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const { busy, msg, run } = useAction();
  const seq = useRef(0);
  const shown = q.trim().length < 2 ? [] : hits;

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await findInvitable(term).catch(() => []);
      if (my === seq.current) {
        setHits(r);
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          placeholder={disabled ? "Every seat is taken" : "Friend's name or email"}
          aria-label="Find a friend to invite"
          className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm disabled:opacity-60"
        />
        {searching && q.trim().length >= 2 && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>
      {shown.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {shown.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={h.name} url={h.avatar_url} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.name}</span>
              <button
                type="button"
                disabled={!!busy}
                data-invite={h.id}
                onClick={() =>
                  run(`inv-${h.id}`, async () => {
                    const r = await inviteFriend(h.id);
                    if (r.ok) {
                      setQ("");
                      setHits([]);
                    }
                    return r;
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy === `inv-${h.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Invite
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && shown.length === 0 && (
        <p className="text-sm text-muted">
          No student found. They need a free account first; send them your invite link below.
        </p>
      )}
      <Note msg={msg} />
    </div>
  );
}

export function CancelInvite({ id }: { id: string }) {
  const { busy, msg, run } = useAction();
  return (
    <>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => run("c", () => cancelInvite(id))}
        className="text-xs font-medium text-danger hover:underline disabled:opacity-60"
      >
        {busy ? "Cancelling…" : "Cancel"}
      </button>
      {msg && !msg.ok && <Note msg={msg} />}
    </>
  );
}

// ------------------------------------------------------------------ member actions

export function MemberActions({
  memberId,
  canNudge,
  canRemove,
  isMe,
  name,
}: {
  memberId: string;
  canNudge: boolean;
  canRemove: boolean;
  isMe: boolean;
  name: string;
}) {
  const { busy, msg, run } = useAction();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canNudge && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("n", () => nudgeFriend(memberId))}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-60"
          title={`Remind ${name} to practise today`}
        >
          <Bell className="h-3.5 w-3.5" /> Nudge
        </button>
      )}
      {canRemove && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => {
            if (!window.confirm(`Remove ${name}? They haven't taken a test since joining. Their seat becomes free.`)) return;
            void run("r", () => removeInactiveMember(memberId));
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
        >
          <UserMinus className="h-3.5 w-3.5" /> Remove
        </button>
      )}
      {isMe && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => {
            if (!window.confirm("Leave this group? Your Premium from the group ends.")) return;
            void run("l", () => leaveFriendsGroup());
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" /> Leave group
        </button>
      )}
      {msg && <Note msg={msg} className="w-full text-right text-xs" />}
    </div>
  );
}

// ------------------------------------------------------------------ privacy

export function PrivacySwitches({ muteNudges, hideBands }: { muteNudges: boolean; hideBands: boolean }) {
  const [mute, setMute] = useState(muteNudges);
  const [hide, setHide] = useState(hideBands);
  const { msg, run } = useAction();
  const save = (m: boolean, h: boolean) => run("p", () => saveFriendsPrivacy(m, h));
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={mute}
          onChange={(e) => {
            setMute(e.target.checked);
            void save(e.target.checked, hide);
          }}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Don&apos;t send me nudges
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={hide}
          onChange={(e) => {
            setHide(e.target.checked);
            void save(mute, e.target.checked);
          }}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        Hide my bands in the group feed
      </label>
      <Note msg={msg} className="text-xs" />
    </div>
  );
}

// ------------------------------------------------------------------ accept / decline

export function InviteResponse({ id, compact = false }: { id: string; compact?: boolean }) {
  const router = useRouter();
  const { busy, msg, run } = useAction();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "justify-end")}>
      <button
        type="button"
        data-accept={id}
        disabled={!!busy}
        onClick={() =>
          run("a", async () => {
            const r = await respondInvite(id, true);
            if (r.ok) router.push("/premium/group?joined=1");
            return r;
          })
        }
        className="inline-flex items-center gap-1.5 rounded-xl bg-premium-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy === "a" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
      </button>
      <button
        type="button"
        data-decline={id}
        disabled={!!busy}
        onClick={() => run("d", () => respondInvite(id, false))}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60"
      >
        <X className="h-4 w-4" /> Decline
      </button>
      <Note msg={msg} className="w-full" />
    </div>
  );
}

export function Avatar({ name, url, size = 9 }: { name: string; url: string | null; size?: 9 | 11 }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-sm font-semibold",
        size === 11 ? "h-11 w-11" : "h-9 w-9",
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
