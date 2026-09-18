"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Crown, Loader2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { beginMock, joinMock, requestMock } from "@/app/actions/mock";
import { MAX_REQUEST_MESSAGE, type MockRequestStatus } from "@/lib/mock-shared";
import { PREMIUM_TELEGRAM_URL } from "@/lib/site";

/**
 * "Request this mock" — or the state of a request already sent.
 * Hand-rolled overlay in the house style (there is no dialog library here).
 * Premium members get "Join this mock" instead: a place at once, no request.
 */
export function MockRequestButton({
  mockId,
  mockTitle,
  status,
  isPremium = false,
}: {
  mockId: string;
  mockTitle: string;
  status: MockRequestStatus | null;
  isPremium?: boolean;
}) {
  if (isPremium) return <MockJoinButton mockId={mockId} />;
  return <RequestFlow mockId={mockId} mockTitle={mockTitle} status={status} />;
}

/** Premium: one click takes the place. The server re-checks the membership. */
function MockJoinButton({ mockId }: { mockId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await joinMock(mockId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Join this mock
      </Button>
      <p className="text-xs text-muted">Premium — no approval needed.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Buying Premium is arranged on Telegram — there is no checkout (lib/site.ts). */
function BuyPremiumLink() {
  return (
    <a
      href={PREMIUM_TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
    >
      <Crown className="h-4 w-4" /> Buy premium
    </a>
  );
}

/** Free members: buy Premium (and join instantly) or request a place. */
function RequestFlow({
  mockId,
  mockTitle,
  status,
}: {
  mockId: string;
  mockTitle: string;
  status: MockRequestStatus | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status === "pending" || sent) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
            <Clock className="h-4 w-4" /> Waiting for approval
          </p>
          <BuyPremiumLink />
        </div>
        <p className="text-xs text-muted">Premium members join instantly — no approval needed.</p>
      </div>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await requestMock(mockId, message);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <BuyPremiumLink />
          <Button variant="outline" onClick={() => setOpen(true)}>
            {status === "rejected" ? "Ask again" : "Request this mock"}
          </Button>
        </div>
        <p className="text-xs text-muted">Premium members join instantly — no approval needed.</p>
        {status === "rejected" && (
          <p className="text-xs text-muted">Your last request was not approved. You can ask again.</p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-elevated">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="pr-6 font-semibold">Request “{mockTitle}”</h2>
            <p className="mt-1 text-sm text-muted">
              Your teacher approves each place. Tell them who you are or which group you are in —
              optional.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_REQUEST_MESSAGE))}
              rows={4}
              placeholder="e.g. I'm in the Monday 6pm group"
              className="mt-3 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-right text-xs tabular-nums text-muted">
              {message.length}/{MAX_REQUEST_MESSAGE}
            </p>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send request
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Starts the exam clock record, then opens the first section. */
export function BeginMockButton({ mockId, href, label }: { mockId: string; href: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await beginMock(mockId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push(href);
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {label}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Re-renders the page every `everyMs` — used while a student waits for the session to start (0054). */
export function AutoRefresh({ everyMs = 20_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [everyMs, router]);
  return null;
}
