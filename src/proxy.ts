import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { SITE_HOST } from "@/lib/site";

// `/reading` and `/listening` are deliberately NOT here: the catalogue and each
// test's detail page are public, so a visitor arriving from Telegram or a search
// engine can see what exists before being asked to register. Access control for
// the content itself lives in /api/test-html/[id], which independently checks
// tier and membership on every request.
const PROTECTED = ["/dashboard", "/writing", "/speaking", "/admin"];
// Exact match, and deliberately only these two. /reset-password must NOT be
// added: a recovery link signs the user in before they land there, so bouncing
// signed-in users away from it would make resetting a password impossible.
const AUTH_PAGES = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p);

  // Four hosts serve this app — mockonline.uz, the DigitalOcean hostname and
  // two Vercel URLs — with identical content. Left alone, Google indexes all
  // four, splits the ranking signals between them and may pick the wrong one
  // as canonical. Only SITE_HOST is indexable; the rest say so in a header.
  //
  // The canonical <link> emitted by the pages always points at SITE_HOST
  // regardless of which host answered, so this is belt and braces.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const isCanonicalHost = host.split(",")[0]!.trim().toLowerCase() === SITE_HOST.toLowerCase();
  if (!isCanonicalHost) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // A signed-in user landing on an auth page goes to their dashboard.
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image optimization.
  //
  // `api/telegram` is excluded because the bot webhook has no session and
  // never wants one: every update would otherwise pay for an updateSession()
  // round trip to Supabase and come back carrying Set-Cookie headers meant
  // for a browser. The path is not in PROTECTED, so this is wasted work
  // rather than a redirect - but on a path Telegram hits constantly it is
  // worth skipping. The route authenticates itself (secret header + owner id).
  matcher: ["/((?!api/telegram|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
