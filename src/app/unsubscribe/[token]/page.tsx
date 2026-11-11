import Link from "next/link";
import type { Metadata } from "next";
import { BellOff, BellRing, MailQuestion } from "lucide-react";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { remindersStateByToken } from "@/lib/reminder-preference";
import { setRemindersFromLink } from "@/app/actions/reminders";
import { SITE_NAME } from "@/lib/site";

// The page the "Stop reminder emails" link in every reminder opens (0061).
//
// TOP-LEVEL and public, like /u/[id]: the student arrives from their inbox,
// usually signed out. Opening the page changes NOTHING. Mail scanners and
// link previewers fetch every link in a message, so a GET that unsubscribed
// would switch reminders off for people who never asked. The change is the
// button, which posts a server action.

export const metadata: Metadata = {
  title: "Reminder emails",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const on = await remindersStateByToken(token);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Link href="/" aria-label={SITE_NAME}>
        <Logo />
      </Link>

      <Card className="w-full max-w-md text-center">
        {on === null ? (
          <>
            <MailQuestion className="mx-auto h-10 w-10 text-muted" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">This link isn&apos;t valid</h1>
            <p className="mt-2 text-sm text-muted">
              It may have been copied incompletely. Open the link from one of our emails again, or sign in
              and switch reminder emails off from your account menu.
            </p>
            <Link href="/login" className="mt-5 inline-block text-sm font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        ) : on ? (
          <>
            <BellRing className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">Stop reminder emails?</h1>
            <p className="mt-2 text-sm text-muted">
              You will no longer get streak, weekly report, inactivity or Premium reminders by email.
              Emails about a mock exam you sit are not affected.
            </p>
            <form action={setRemindersFromLink.bind(null, token, false)} className="mt-5">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                Stop reminder emails
              </button>
            </form>
          </>
        ) : (
          <>
            <BellOff className="mx-auto h-10 w-10 text-muted" />
            <h1 className="mt-3 text-xl font-bold tracking-tight">Reminder emails are off</h1>
            <p className="mt-2 text-sm text-muted">
              We won&apos;t send you any more reminders. Your account and your results are unchanged.
            </p>
            <form action={setRemindersFromLink.bind(null, token, true)} className="mt-5">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                Turn them back on
              </button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
