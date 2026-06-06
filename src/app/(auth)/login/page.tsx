import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton } from "@/components/auth/google-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
        <p className="text-sm text-muted">Sign in to continue your practice.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
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
  );
}
