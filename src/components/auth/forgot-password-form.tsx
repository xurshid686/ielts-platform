"use client";

import { useState } from "react";
import { useId } from "react";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    // The recovery link lands on the SAME callback that OAuth and email
    // confirmation already use: the browser client is PKCE by default, so the
    // link arrives with ?code=… and /auth/callback exchanges it for a session
    // before forwarding to `next`. No second route handler needed.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        "/reset-password",
      )}`,
    });

    // Deliberately ignores the result. Telling the visitor whether the address
    // exists would turn this form into an account-enumeration oracle.
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3 rounded-lg border border-success/30 bg-success/10 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <MailCheck className="h-4 w-4" /> Check your email
        </p>
        <p className="text-sm text-muted">
          If an account exists for <strong className="text-foreground">{email}</strong>, we&apos;ve
          sent a reset link. It expires in one hour.
        </p>
        <p className="text-sm text-muted">
          Open the link in <strong className="text-foreground">this same browser</strong> — for
          security, a link opened elsewhere can&apos;t complete the reset.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          Email
        </label>
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
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
