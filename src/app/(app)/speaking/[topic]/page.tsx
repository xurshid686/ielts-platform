import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getTopic } from "@/lib/ielts/speaking-prompts";
import { SpeakingMock } from "@/components/speaking/speaking-mock";

export default async function SpeakingTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  await requireProfile();
  const { topic: topicId } = await params;
  const topic = getTopic(topicId);
  if (!topic) notFound();

  return <SpeakingMock topic={topic} />;
}
