import Link from "next/link";
import { Gift } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterPanel } from "@/components/auth/auth-panels";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>;
}) {
  const { next, ref } = await searchParams;

  return (
    <AuthShell panel={<RegisterPanel />}>
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
        {/* What the account gives, in the two lines a phone has room for
            before the form (the panel that argues this is desktop-only). */}
        <p className="text-pretty text-sm text-muted">
          Free. It saves every score, shows each answer beside the correct one, and
          tracks your band.
        </p>
      </div>

      {ref && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-primary">
          <Gift className="h-4 w-4 shrink-0" />
          <span>You&apos;ve been invited — sign up to claim your welcome bonus.</span>
        </div>
      )}

      <GoogleButton next={next} />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <AuthForm mode="register" next={next} />

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
    </AuthShell>
  );
}
