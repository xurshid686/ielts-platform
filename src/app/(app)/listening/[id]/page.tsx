import { permanentRedirect } from "next/navigation";
import { TestDetail } from "@/components/sections/test-detail";
import { canonicalRedirectFor } from "@/lib/tests/canonical";
import { testPageMetadata } from "@/lib/test-metadata";

export default async function ListeningTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A uuid URL 308s to its slug. This lives HERE, not in TestDetail: a redirect
  // thrown once rendering has begun degrades to a client-side meta refresh, and
  // the uuid would then answer 200 with a full duplicate of the page. See
  // `canonicalRedirectFor`.
  const canonical = await canonicalRedirectFor("listening", id);
  if (canonical) permanentRedirect(canonical);

  return <TestDetail skill="listening" id={id} />;
}

// Every test page had the same <title> ("IELTS Practice Platform") and no
// description, so all 8+ of them competed as duplicates. The passage title is
// the thing students actually search for, so it leads.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return testPageMetadata(id, "listening");
}
