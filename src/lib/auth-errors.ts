// Human wording for the auth failures a student can actually hit.
//
// Two separate concerns live here:
//
//  * `authErrorMessage` maps the FIXED codes we put in a redirect query string
//    (?error=auth). The codes are fixed, never reflected text, so a crafted URL
//    can't paint arbitrary words on our sign-in page.
//  * `friendlySupabaseError` softens the raw `error.message` Supabase hands the
//    browser. It deliberately PASSES THROUGH anything it doesn't recognise —
//    "User already registered" and "Password should be at least 6 characters"
//    are more useful verbatim than behind a generic apology.

export const AUTH_ERRORS: Record<string, string> = {
  auth: "Could not sign you in. Please try again.",
  expired:
    "That reset link has expired or was already used. Request a new one below — links last one hour.",
};

export function authErrorMessage(code?: string | null): string | null {
  if (!code) return null;
  return AUTH_ERRORS[code] ?? "Something went wrong. Please try again.";
}

const FRIENDLY: [RegExp, string][] = [
  [
    /invalid login credentials/i,
    "That email and password don't match an account. Check them, or reset your password.",
  ],
  [/email not confirmed/i, "Please confirm your email first — check your inbox for the link."],
  [
    /for security purposes|rate limit|too many requests/i,
    "Too many attempts. Please wait a minute and try again.",
  ],
  [/failed to fetch|network/i, "Couldn't reach the server. Check your connection and try again."],
];

export function friendlySupabaseError(message: string): string {
  for (const [pattern, friendly] of FRIENDLY) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}
