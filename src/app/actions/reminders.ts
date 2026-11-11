"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setRemindersByToken } from "@/lib/reminder-preference";

// Reminder-email preference (migration 0061).
//
// Two ways in, because the unsubscribe link has to work SIGNED OUT (a student
// opens it from their inbox, often on a phone that has never signed in):
//
//  - `setEmailReminders`  the signed-in switch in the account menu. It writes
//    through the student's own client: `email_reminders` is a user-owned
//    preference, allowed by RLS `profiles_update_self`.
//  - `setRemindersFromLink`  the button on /unsubscribe/<token>. There is no
//    session, so the TOKEN is the credential. It is a random uuid that only
//    ever appears in that student's own emails, and all it can do is flip this
//    one boolean.

export async function setEmailReminders(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { error } = await supabase.from("profiles").update({ email_reminders: !!on }).eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Bound to the token and the wanted state by the page's <form action>. */
export async function setRemindersFromLink(token: string, on: boolean): Promise<void> {
  await setRemindersByToken(token, on);
  revalidatePath(`/unsubscribe/${token}`);
}
