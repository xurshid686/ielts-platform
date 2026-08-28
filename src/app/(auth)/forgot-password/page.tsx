import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { authErrorMessage } from "@/lib/auth-errors";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Arrives as ?error=expired when /auth/callback could not exchange a
  // recovery code — a stale link, a reused one, or a different browser.
  const errorMessage = authErrorMessage(error);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Reset your password</h2>
        <p className="text-sm text-muted">
          Enter your email and we&apos;ll send you a link to set a new one.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      )}

      <ForgotPasswordForm />

      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
