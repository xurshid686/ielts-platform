import { TestDetail } from "@/components/sections/test-detail";

export default async function ListeningTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TestDetail skill="listening" id={id} />;
}
