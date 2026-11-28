"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Link2, LogIn, ShieldAlert, ExternalLink, RefreshCw } from "lucide-react";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { SITE_URL } from "@/lib/site";
import { copy, pickLang, type Lang } from "@/lib/telegram/bot-copy";

// What /tg shows while it signs a Telegram user in. See src/app/tg/page.tsx and
// src/app/api/telegram-miniapp/session/route.ts for the rules.

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { language_code?: string } };
  platform?: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  openLink?(url: string): void;
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type View =
  | { kind: "busy" }
  | { kind: "not_linked"; signedIn: boolean; name: string | null }
  | { kind: "admin" }
  | { kind: "failed" }
  | { kind: "web" }
  | { kind: "linked" };

// Telegram on the web runs a Mini App in an IFRAME: third-party cookies are blocked there, so a
// session could never stick. Those clients get the site in a new browser tab instead.
const WEB_PLATFORMS = new Set(["web", "weba", "webk"]);

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/telegram-miniapp/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    reason?: string;
    signedIn?: boolean;
    name?: string | null;
  };
  return data;
}

export function MiniAppGate({ next }: { next: string }) {
  const [view, setView] = useState<View>({ kind: "busy" });
  const [lang, setLang] = useState<Lang>("en");
  const started = useRef(false);
  const t = copy(lang).tg;

  const go = useCallback(() => window.location.replace(next), [next]);

  const signIn = useCallback(
    async (wa: TelegramWebApp) => {
      setView({ kind: "busy" });
      try {
        const r = await post({ initData: wa.initData });
        if (r.ok) return go();
        if (r.reason === "not_linked") return setView({ kind: "not_linked", signedIn: !!r.signedIn, name: r.name ?? null });
        if (r.reason === "admin") return setView({ kind: "admin" });
        setView({ kind: "failed" });
      } catch {
        setView({ kind: "failed" });
      }
    },
    [go],
  );

  // Runs from <Script onReady>: once the SDK has loaded, and again on every remount after that.
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const wa = window.Telegram?.WebApp;
    // Not inside Telegram (or no signed data): behave like a plain link.
    if (!wa || !wa.initData) return go();
    wa.ready();
    wa.expand();
    wa.setHeaderColor?.("#178a52");
    setLang(pickLang(wa.initDataUnsafe?.user?.language_code));
    if (wa.platform && WEB_PLATFORMS.has(wa.platform)) {
      setView({ kind: "web" });
      wa.openLink?.(`${SITE_URL}${next}`);
      return;
    }
    void signIn(wa);
  }, [go, next, signIn]);

  // The SDK failed to load at all (blocked network): don't strand the student on a spinner.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!started.current) {
        started.current = true;
        go();
      }
    }, 8000);
    return () => clearTimeout(id);
  }, [go]);

  async function linkHere() {
    const wa = window.Telegram?.WebApp;
    if (!wa) return;
    setView({ kind: "busy" });
    const r = await post({ initData: wa.initData, link: true }).catch(() => ({ ok: false }));
    if (!r.ok) return setView({ kind: "failed" });
    setView({ kind: "linked" });
    go();
  }

  const loginHref = `/login?next=${encodeURIComponent(`/tg?next=${encodeURIComponent(next)}`)}`;
  const btn =
    "inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={start} />
      <Logo />
      <Card className="w-full max-w-sm text-center">
        {view.kind === "busy" || view.kind === "linked" ? (
          <div className="flex flex-col items-center gap-3 py-4" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted">{view.kind === "linked" ? t.linked : t.signingIn}</p>
          </div>
        ) : view.kind === "not_linked" ? (
          <>
            <Link2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">{t.notLinkedTitle}</h1>
            <p className="mt-2 text-sm text-muted">{t.notLinkedBody}</p>
            <div className="mt-5 flex flex-col gap-2">
              {view.signedIn && view.name ? (
                <button type="button" onClick={linkHere} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
                  <Link2 className="h-4 w-4" />
                  {t.linkThis(view.name)}
                </button>
              ) : (
                <a href={loginHref} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
                  <LogIn className="h-4 w-4" />
                  {t.signInEmail}
                </a>
              )}
              <button
                type="button"
                onClick={() => window.Telegram?.WebApp?.openLink?.(`${SITE_URL}/dashboard`)}
                className={`${btn} border border-border hover:bg-surface-2`}
              >
                <ExternalLink className="h-4 w-4" />
                {t.openBrowser}
              </button>
            </div>
          </>
        ) : view.kind === "admin" ? (
          <>
            <ShieldAlert className="mx-auto h-10 w-10 text-muted" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">{t.adminTitle}</h1>
            <p className="mt-2 text-sm text-muted">{t.adminBody}</p>
            <a href={`/login?next=${encodeURIComponent(next)}`} className={`${btn} mt-5 bg-primary text-primary-foreground hover:bg-primary/90`}>
              <LogIn className="h-4 w-4" />
              {t.signInEmail}
            </a>
          </>
        ) : view.kind === "web" ? (
          <>
            <ExternalLink className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">{t.webTitle}</h1>
            <p className="mt-2 text-sm text-muted">{t.webBody}</p>
            <a href={`${SITE_URL}${next}`} target="_blank" rel="noopener" className={`${btn} mt-5 bg-primary text-primary-foreground hover:bg-primary/90`}>
              <ExternalLink className="h-4 w-4" />
              MockOnline
            </a>
          </>
        ) : (
          <>
            <ShieldAlert className="mx-auto h-10 w-10 text-muted" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">{t.failedTitle}</h1>
            <p className="mt-2 text-sm text-muted">{t.failedBody}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`${btn} mt-5 border border-border hover:bg-surface-2`}
            >
              <RefreshCw className="h-4 w-4" />
              {t.tryAgain}
            </button>
          </>
        )}
      </Card>
    </div>
  );
}
