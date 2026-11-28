import { Send } from "lucide-react";
import { isLinked } from "@/lib/student-bot";
import { studentBotConfigured, studentBotUsername } from "@/lib/telegram/student-api";

/**
 * "Get a daily test on Telegram" (0070). Renders nothing until the student bot
 * is configured, and nothing once this account is linked. The link goes
 * through /api/student-bot/link, which mints the single-use code.
 */
export async function TelegramDailyCard({ userId }: { userId: string }) {
  if (!studentBotConfigured() || !studentBotUsername()) return null;
  if (await isLinked(userId)) return null;
  return (
    <div className="flex h-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="min-w-0">
        <p className="font-semibold">Get one test a day on Telegram</p>
        <p className="mt-1 text-sm text-muted">
          Every morning we send a test picked for your weakest question type. Stop any time.
        </p>
      </div>
      {/* A plain <a>: the route answers with a redirect to t.me, not a page. */}
      <a
        href="/api/student-bot/link"
        className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
      >
        <Send className="h-4 w-4" /> Connect Telegram
      </a>
    </div>
  );
}
