"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/utils";
import { friendlySupabaseError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(friendlySupabaseError(error.message));
        setLoading(false);
        return;
      }
    // If email confirmation is ON, there is no session yet.
      if (!data.session) {
        setInfo("Check your email to confirm your account, then sign in.");
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(friendlySupabaseError(error.message));
        setLoading(false);
        return;
      }
    }

    router.push(safeNext(next));
    router.refresh();
  }

  return (
    // method="post" is a SAFETY NET, not a route — nothing serves POST here.
    //
    // This form is submitted by `handleSubmit` in the browser. But between the
    // HTML arriving and React hydrating, the button is a plain submit button,
    // and a student on a slow connection who clicks in that window gets the
    // browser's DEFAULT submit. The default method is GET, which serialises
    // every named field INTO THE URL — reproduced 2026-09-05:
    //
    //     /login?email=someone@gmail.com&password=<their real password>
    //
    // which is then in their history and in the Cloudflare/DigitalOcean access
    // logs, while the sign-in silently does nothing and they just retry.
    //
    // POST puts the fields in a request body instead, so the password never
    // reaches the URL. The page has no POST handler, so an early submit now
    // fails VISIBLY (405) rather than quietly leaking. That trade is
    // deliberate: a rare ugly error beats a silent credential leak.
    <form onSubmit={handleSubmit} method="post" className="space-y-4">
      {mode === "register" && (
        <Field label="Full name">
          {(id) => (
            <input
              id={id}
              name="name"
              className="auth-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              required
            />
          )}
        </Field>
      )}
      <Field label="Email">
        {(id) => (
          <input
            id={id}
            name="email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        )}
      </Field>

      <PasswordField
        value={password}
        onChange={setPassword}
        // Tells a password manager to offer a saved password on login and to
        // generate/save a new one on register. Both were missing.
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        newPassword={mode === "register"}
        labelAccessory={
          mode === "login" ? (
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          ) : undefined
        }
      />

      {error && <p className="text-sm text-danger">{error}</p>}
      {info && <p className="text-sm text-success">{info}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}

/**
 * A labelled field. Takes a render function so the input can receive the
 * generated id — an explicit htmlFor/id pair, rather than relying on the label
 * wrapping the control.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
