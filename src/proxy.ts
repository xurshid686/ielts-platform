import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { SITE_HOST } from "@/lib/site";
import { USE_SLUG_URLS } from "@/lib/tests/ref";

// `/reading` and `/listening` are deliberately NOT here: the catalogue and each
// test's detail page are public, so a visitor arriving from Telegram or a search
// engine can see what exists before being asked to register. Access control for
// the content itself lives in /api/test-html/[id], which independently checks
// tier and membership on every request.
const PROTECTED = ["/dashboard", "/writing", "/speaking", "/admin", "/discipline"];
// Exact match, and deliberately only these two. /reset-password must NOT be
// added: a recovery link signs the user in before they land there, so bouncing
// signed-in users away from it would make resetting a password impossible.
const AUTH_PAGES = ["/login", "/register"];

/**
 * A legacy test URL: `/reading/<uuid>` or `/listening/<uuid>`.
 *
 * Since migration 0044 the canonical form is `/reading/<slug>`, and every link
 * the site emits — catalogue, sitemap, related strip, bot — uses it. This
 * matches only what is left: bookmarks, Telegram history, and `next=` params in
 * sign-in links already sent.
 */
const LEGACY_TEST_URL =
  /^\/(reading|listening)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Looks up a test's slug for the redirect below.
 *
 * Straight REST with the ANON key, not a Supabase client: middleware runs on
 * every request and should not pull a client library in for a lookup that fires
 * only on legacy URLs. `slug` is readable by `anon` as of migration 0045, and
 * there is nothing else to read here.
 *
 * Returns null on any failure. A slug we cannot resolve means the request falls
 * through to the page, which resolves the uuid itself — a slow correct answer,
 * never an error page.
 */
async function slugForTest(skill: string, id: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  try {
    const res = await fetch(
      `${base}/rest/v1/tests?select=slug&id=eq.${id}&skill=eq.${skill}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { slug: string | null }[];
    return rows[0]?.slug || null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Canonicalise a legacy uuid URL to its slug, HERE rather than in the page.
  //
  // `permanentRedirect()` inside the route emits a real 308 only while the
  // response is unstarted, and by the time a page component runs Next has begun
  // streaming the shell — so it degrades to `<meta http-equiv="refresh">` and
  // the uuid answers 200 with a full duplicate of the page. Verified by curl
  // both ways. Middleware runs before any of that, so it can still send a
  // status code. The page keeps its own redirect as a backstop for when this
  // lookup fails.
  // Gated on USE_SLUG_URLS: while the site still LINKS by uuid, redirecting
  // uuid -> slug would move every visitor off the url the sitemap, the canonical
  // tag and Google all currently name.
  const legacy = USE_SLUG_URLS ? LEGACY_TEST_URL.exec(pathname) : null;
  if (legacy) {
    const slug = await slugForTest(legacy[1].toLowerCase(), legacy[2].toLowerCase());
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/${legacy[1].toLowerCase()}/${slug}`;
      // 308, not 307: this is permanent, and it is what tells Google to move
      // any signal the old URL earned onto the new one.
      return NextResponse.redirect(url, 308);
    }
  }

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
