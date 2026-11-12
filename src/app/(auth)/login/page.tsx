import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginPanel } from "@/components/auth/auth-panels";
import { authErrorMessage } from "@/lib/auth-errors";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Fixed copy per code — never render the raw query param.
  const errorMessage = authErrorMessage(error);

  return (
    <AuthShell panel={<LoginPanel />}>
      <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        {/* The one line a phone visitor gets (the panel is desktop-only). */}
        <p className="text-pretty text-sm text-muted">
          Sign in to see your saved scores, answer reviews and band history.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      )}

      <GoogleButton next={next} />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <AuthForm mode="login" next={next} />

      <p className="text-center text-sm text-muted">
        No account?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
    </AuthShell>
  );
}
