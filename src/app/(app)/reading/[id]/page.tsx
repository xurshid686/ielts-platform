import { TestDetail } from "@/components/sections/test-detail";
import { testPageMetadata } from "@/lib/test-metadata";

export default async function ReadingTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TestDetail skill="reading" id={id} />;
}

// Every test page had the same <title> ("IELTS Practice Platform") and no
// description, so all 121+ of them competed as duplicates. The passage title is
// the thing students actually search for, so it leads.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return testPageMetadata(id, "reading");
}
