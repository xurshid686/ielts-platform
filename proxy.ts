import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { SPEAKING_ONLY_ALLOWED, SPEAKING_ONLY_HOME } from "@/lib/levels";

const PROTECTED = ["/dashboard", "/reading", "/listening", "/writing", "/speaking", "/admin"];
const AUTH_PAGES = ["/login", "/register"];

/** Paths a speaking-only student may open (everything else -> /speaking). */
function speakingOnlyAllows(pathname: string) {
  return SPEAKING_ONLY_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p);

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Resolve the student's level only when it can affect routing: a signed-in
  // user on an auth page (decides where to land) or on a non-allowed page (a
  // speaking-only student must be bounced to Speaking). Regular students
  // browsing their allowed pages never trigger this extra query.
  let speakingOnly = false;
  if (user && (isAuthPage || !speakingOnlyAllows(pathname))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("level, role")
      .eq("id", user.id)
      .single();
    speakingOnly = profile?.level === "speaking_only" && profile?.role !== "admin";
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = speakingOnly ? SPEAKING_ONLY_HOME : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Speaking-only students are confined to the Speaking section.
  if (speakingOnly && !speakingOnlyAllows(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = SPEAKING_ONLY_HOME;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
