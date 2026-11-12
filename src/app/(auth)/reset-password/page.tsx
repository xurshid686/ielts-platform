import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPanel } from "@/components/auth/auth-panels";

export const metadata = { title: "Set a new password" };

/**
 * Where a recovery link lands, after /auth/callback has traded its `code` for a
 * session. Note this route is NOT in proxy.ts's AUTH_PAGES: that list bounces
 * signed-in users to /dashboard, and by the time anyone reaches this page they
 * ARE signed in — bouncing them would make the reset impossible.
 */
export default function ResetPasswordPage() {
  return (
    <AuthShell panel={<ResetPanel step={3} />}>
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
        <p className="text-sm text-muted">Choose something you haven&apos;t used here before.</p>
      </div>

      <ResetPasswordForm />
    </div>
    </AuthShell>
  );
}
