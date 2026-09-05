"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlySupabaseError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";

type Gate = "checking" | "ready" | "no-session";

export function ResetPasswordForm() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // /auth/callback exchanged the recovery code for a session before redirecting
  // here, so a session should already exist. If it doesn't, the link was stale,
  // already used, or opened in a browser that never held the PKCE verifier.
  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setGate(data.session ? "ready" : "no-session");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(friendlySupabaseError(error.message));
      setLoading(false);
      return;
    }

    // Someone resetting a password may be locking an intruder out, so drop
    // every OTHER session while keeping this one.
    await supabase.auth.signOut({ scope: "others" });

    router.push("/dashboard");
    router.refresh();
  }

  if (gate === "checking") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking your link…
      </p>
    );
  }

  if (gate === "no-session") {
    return (
      <div className="space-y-3 rounded-lg border border-danger/30 bg-danger/10 p-4">
        <p className="text-sm font-medium text-danger">This reset link is no longer valid.</p>
        <p className="text-sm text-muted">
          It may have expired, been used already, or been opened in a different browser from the
          one that requested it.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex text-sm font-medium text-primary hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    // method="post" for the same reason as the sign-in form: a submit that
    // lands before React hydrates falls back to the browser default, GET, which
    // would put the NEW password in the URL and the server logs. The leak is
    // identical; only the field differs. See auth-form.tsx.
    <form onSubmit={handleSubmit} method="post" className="space-y-4">
      <PasswordField
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        newPassword
      />
      <PasswordField
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        name="confirm-password"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
