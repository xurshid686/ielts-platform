import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getWritingPrompt } from "@/lib/ielts/writing-prompts";
import { WritingEditor } from "@/components/writing/writing-editor";

export default async function WritingPromptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const prompt = getWritingPrompt(id);
  if (!prompt) notFound();

  return <WritingEditor prompt={prompt} />;
}
