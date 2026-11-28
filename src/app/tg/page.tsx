import type { Metadata } from "next";
import { safeNext } from "@/lib/utils";
import { MiniAppGate } from "@/components/telegram/mini-app-gate";

// The Telegram Mini App's front door (@MockOnlineMaterials_bot: the "MockOnline"
// menu button, the welcome's "Open MockOnline" and every "Start the test").
//
// TOP-LEVEL and public, like /unsubscribe: no app shell, no header. It signs a
// linked student in from Telegram's signed initData (POST
// /api/telegram-miniapp/session) and then replaces itself with `next`. Opened
// in an ordinary browser it simply forwards to `next`.

export const metadata: Metadata = {
  title: "MockOnline",
  robots: { index: false, follow: false },
};

export default async function TelegramMiniAppPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <MiniAppGate next={safeNext(Array.isArray(next) ? next[0] : next)} />;
}
