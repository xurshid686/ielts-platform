"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Loader2,
  Trash2,
  AtSign,
  BookOpen,
  Headphones,
  Inbox,
} from "lucide-react";
import {
  approveCambridgeRequest,
  rejectCambridgeRequest,
  grantCambridgeByEmail,
  revokeCambridgeAccess,
} from "@/app/actions/cambridge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, timeAgo } from "@/lib/utils";
import type { CambridgeMember, CambridgeRequest } from "@/lib/cambridge";

type Msg = { ok: boolean; text: string } | null;
type Tab = "requests" | "members" | "tests";

export type CambridgeTestRow = {
  id: string;
  title: string;
  skill: "reading" | "listening";
  created_at: string;
};

export function AdminCambridge({
  requests,
  members,
  tests,
}: {
  requests: CambridgeRequest[];
  members: CambridgeMember[];
  tests: CambridgeTestRow[];
}) {
  const [tab, setTab] = useState<Tab>("requests");
  const [msg, setMsg] = useState<Msg>(null);

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1.5">
        {(
          [
            ["requests", `Requests${pending.length ? ` (${pending.length})` : ""}`],
            ["members", `Members (${members.length})`],
            ["tests", `Tests (${tests.length})`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setMsg(null);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === id
                ? "bg-primary/10 text-primary"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg && (
        <p
          className={cn(
            "sticky top-0 z-10 rounded-lg border bg-surface px-3 py-2 text-sm shadow-soft",
            msg.ok ? "border-success/30 text-success" : "border-danger/30 text-danger",
          )}
        >
          {msg.text}
        </p>
      )}

      {tab === "requests" && <Requests requests={requests} onMsg={setMsg} />}
      {tab === "members" && <Members members={members} onMsg={setMsg} />}
      {tab === "tests" && <Tests tests={tests} />}
    </div>
  );
}

/**
 * Runs an action inside a React 19 transition and refreshes the route.
 *
 * Copied from admin-discipline.tsx, including the reason: this page must NEVER
 * call `window.location.reload()`. A reload throws the owner back to the top of
 * the page and wipes the confirmation message before it can be read. `busy` is
 * derived from the transition rather than cleared by hand, so no button has to
 * remember to un-busy itself and there is no setState-in-an-effect.
 */
function useRunner(onMsg: (m: Msg) => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState<string | null>(null);

  function run(
    innerKey: string,
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    okText: string,
    onSuccess?: () => void,
  ) {
    setKey(innerKey);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        onMsg({ ok: false, text: res.error });
        return;
      }
      onMsg({ ok: true, text: okText });
      onSuccess?.();
      router.refresh();
    });
  }

  return { busy: pending ? key : null, run };
}

// -------------------------------------------------------------- requests

function Requests({ requests, onMsg }: { requests: CambridgeRequest[]; onMsg: (m: Msg) => void }) {
  const { busy, run } = useRunner(onMsg);

  // Pending first — the queue is the job. Decided requests stay visible below
  // as the record of what was answered and when.
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="font-semibold">Waiting for you</h2>

        {pending.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="Nothing pending"
            desc="New requests appear here, and on Telegram."
          />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => (
              <li key={r.user_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name || r.email || "A student"}</p>
                  <p className="text-xs text-muted">{r.email}</p>
                  {r.message && <p className="mt-1 text-sm italic text-muted">“{r.message}”</p>}
                  <p className="mt-1 text-xs text-muted">asked {timeAgo(r.created_at)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={busy === r.user_id}
                    onClick={() =>
                      run(
                        r.user_id,
                        () => approveCambridgeRequest(r.user_id),
                        `${r.name || r.email} can now open the Cambridge tests.`,
                      )
                    }
                  >
                    {busy === r.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.user_id}
                    onClick={() =>
                      run(
                        r.user_id,
                        () => rejectCambridgeRequest(r.user_id),
                        `Request from ${r.name || r.email} rejected.`,
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {decided.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Already answered</h2>
          <ul className="divide-y divide-border">
            {decided.map((r) => (
              <li key={r.user_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name || r.email || "A student"}</p>
                  <p className="text-xs text-muted">{r.email}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                    r.status === "approved"
                      ? "bg-success/10 text-success"
                      : "bg-danger/10 text-danger",
                  )}
                >
                  {r.status}
                  {r.decided_at ? ` · ${timeAgo(r.decided_at)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// --------------------------------------------------------------- members

function Members({ members, onMsg }: { members: CambridgeMember[]; onMsg: (m: Msg) => void }) {
  const { busy, run } = useRunner(onMsg);
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="font-semibold">Add a student directly</h2>
        <p className="text-sm text-muted">
          For someone who asked you in person. They do not need to send a request first.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("grant", () => grantCambridgeByEmail(email), `${email} now has Cambridge access.`, () =>
              setEmail(""),
            );
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3">
            <AtSign className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              className="h-10 w-full bg-transparent text-sm outline-none"
            />
          </label>
          <Button type="submit" disabled={busy === "grant"}>
            {busy === "grant" && <Loader2 className="h-4 w-4 animate-spin" />}
            Grant access
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Approved students</h2>
          <span className="text-sm text-muted">{members.length}</span>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-muted">Nobody has access yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.name || m.email || "A student"}</p>
                  <p className="text-xs text-muted">
                    {m.email} · since {timeAgo(m.granted_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === m.user_id}
                  onClick={() =>
                    run(
                      m.user_id,
                      () => revokeCambridgeAccess(m.user_id),
                      `${m.name || m.email} no longer has Cambridge access.`,
                    )
                  }
                >
                  {busy === m.user_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------- tests

function Tests({ tests }: { tests: CambridgeTestRow[] }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Cambridge papers</h2>
      <p className="text-sm text-muted">
        Upload these on <span className="font-medium">Manage tests</span> with the track set to
        “Cambridge only”.
      </p>

      {tests.length === 0 ? (
        <p className="text-sm text-muted">No Cambridge tests uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tests.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              {t.skill === "reading" ? (
                <BookOpen className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Headphones className="h-4 w-4 shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              <span className="shrink-0 text-xs text-muted">{timeAgo(t.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
