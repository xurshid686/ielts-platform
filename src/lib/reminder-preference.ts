import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// The token side of the reminder preference (migration 0061): reading and
// flipping `profiles.email_reminders` for whoever holds an unsubscribe link.
// Service role, because the caller has no session. Used by the
// /unsubscribe/<token> page, its server action and POST /api/unsubscribe.
//
// It selects and writes ONE boolean, keyed on the token, and returns nothing
// else about the account: a guessed token must not become a profile lookup.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `null` when the token is malformed or belongs to nobody. */
export async function remindersStateByToken(token: string): Promise<boolean | null> {
  if (!UUID.test(token)) return null;
  const { data } = await createAdminClient()
    .from("profiles")
    .select("email_reminders")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  const row = data as { email_reminders: boolean } | null;
  return row ? row.email_reminders : null;
}

/** True when a row was changed or already had that value. */
export async function setRemindersByToken(token: string, on: boolean): Promise<boolean> {
  if (!UUID.test(token)) return false;
  const { data, error } = await createAdminClient()
    .from("profiles")
    .update({ email_reminders: on })
    .eq("unsubscribe_token", token)
    .select("id");
  if (error) {
    console.error("[reminder-preference] update failed", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}
