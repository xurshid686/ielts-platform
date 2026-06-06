import { TestDetail } from "@/components/sections/test-detail";

export default async function ReadingTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TestDetail skill="reading" id={id} />;
}
