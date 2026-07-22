import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Shareable test link. Requires login: anonymous visitors are sent to /login
// (proxy.ts also gates /practice) and returned here, then forwarded into the
// normal authenticated flow. Only tests flagged is_public = true resolve;
// everything else 404s.

async function getPublicTest(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tests")
    .select("id, title, skill, is_public")
    .eq("id", id)
    .single();
  const row = data as
    | { id: string; title: string; skill: "reading" | "listening"; is_public?: boolean }
    | null;
  if (!row || row.is_public !== true) return null;
  return row;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const test = await getPublicTest(id);
  if (!test) return { title: "Test not found" };
  return {
    title: `${test.title} — Free IELTS Practice`,
    description: "Take this IELTS practice test free. Sign in to start and save your result.",
  };
}

export default async function PublicPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const test = await getPublicTest(id);
  if (!test) notFound();

  // Defense in depth alongside proxy.ts: no anonymous test-taking. Signed-in
  // visitors go through the normal authenticated flow so their result saves
  // (XP, rating, streak, full answer review).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/practice/${test.id}`);

  redirect(`/${test.skill}/${test.id}`);
}
