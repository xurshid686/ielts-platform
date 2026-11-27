"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cleanCode, joinGroup, groupOf, notifyJoined } from "@/lib/friends";

/** Join a Friends group from /join/<code>. The user is the signed-in session, never a form field. */
export async function joinFriendsGroup(formData: FormData): Promise<void> {
  const code = cleanCode(String(formData.get("code") ?? ""));
  if (!code) redirect("/premium");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);

  const status = await joinGroup(user.id, code);
  if (status === "joined") {
    const mine = await groupOf(user.id);
    if (mine) await notifyJoined(mine, user.id);
    revalidatePath("/", "layout");
    redirect("/premium/group?joined=1");
  }
  if (status === "already") redirect("/premium/group");
  redirect(`/join/${code}?error=${status}`);
}
