import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PublicTestRunner } from "@/components/public-test-runner";

// Public, no-login test page. Lives OUTSIDE the (app)/(auth) route groups so it
// inherits neither the authenticated layout nor requireProfile(). Only tests
// flagged is_public = true are reachable; everything else 404s.

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
    description: "Take this IELTS practice test free, no sign-up needed. Register to save your result.",
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

  // Logged-in visitors take the test through the normal authenticated flow so
  // their result SAVES (XP, rating, streak, full answer review). The public
  // no-save runner is only for anonymous visitors. After registering via the
  // CTA (next=/practice/[id]) they land back here already signed in and get
  // redirected into the saving flow.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(`/${test.skill}/${test.id}`);

  return <PublicTestRunner testId={test.id} title={test.title} skill={test.skill} />;
}
