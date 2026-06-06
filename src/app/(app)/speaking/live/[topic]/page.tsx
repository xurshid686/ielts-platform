import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getTopic } from "@/lib/ielts/speaking-prompts";
import { LiveConversation } from "@/components/speaking/live-conversation";

export default async function LiveSpeakingPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  await requireProfile();
  const { topic: topicId } = await params;
  const topic = getTopic(topicId);
  if (!topic) notFound();

  return <LiveConversation topic={topic} />;
}
