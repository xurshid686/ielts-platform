"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/utils";

// Google Identity Services, loaded from accounts.google.com.
type CredentialResponse = { credential: string };
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            nonce?: string;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

// Inlined at build time, so it is a constant for the life of the bundle.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// GIS wants the SHA-256 of the nonce; Supabase verifies against the raw value.
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(script);
  });
}

// Signs in with the ID token Google hands us directly, so the consent screen
// names this site — not the Supabase project host, which is what a
// signInWithOAuth redirect through <ref>.supabase.co/auth/v1/callback showed.
export function GoogleButton({ next }: { next?: string }) {
  const router = useRouter();
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(
    CLIENT_ID ? null : "Google sign-in is not configured.",
  );

  useEffect(() => {
    if (!CLIENT_ID) return;

    let cancelled = false;

    (async () => {
      try {
        const [{ raw, hashed }] = await Promise.all([makeNonce(), loadGsi()]);
        if (cancelled || !target.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: hashed,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }) => {
            const supabase = createClient();
            const { error: signInError } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: credential,
              nonce: raw,
            });
            if (signInError) {
              setError(signInError.message);
              return;
            }
            router.push(safeNext(next));
            router.refresh();
          },
        });

        window.google.accounts.id.renderButton(target.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: target.current.offsetWidth || 320,
        });
      } catch {
        if (!cancelled) setError("Could not load Google sign-in.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [next, router]);

  return (
    <div className="space-y-2">
      {/* GIS replaces this node with Google's own rendered button. */}
      <div ref={target} className="flex w-full justify-center [&>div]:w-full" />
      {error && (
        <p className="text-center text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
