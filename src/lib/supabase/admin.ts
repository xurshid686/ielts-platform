import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS. SERVER-ONLY, and only for
 * trusted server contexts (cron jobs, admin batch tasks). Never expose the
 * service-role key to the browser or import this from a client component.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
