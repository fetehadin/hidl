import { createServerClient } from "@supabase/ssr";
import { NextResponse, userAgent, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

// /welcome is the landing page, /install the "get the app" help: both for signed-out visitors.
const PUBLIC_PATHS = ["/login", "/auth", "/welcome", "/install", "/download"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session cookie if needed. Don't put code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Signed-out visitors on a computer get the landing page at "/" (the address stays "/").
  // Phones skip it and go straight to sign-in below: there, hidl is used as an installed app.
  if (!signedIn && pathname === "/" && userAgent(request).device.type !== "mobile") {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    const rewrite = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
    rewrite.headers.set("Vary", "User-Agent, Cookie");
    return rewrite;
  }

  // Optimistic redirect only. Pages and actions re-check with requireUser().
  // /api/cron and /api/widget authorize themselves (a secret header, a per-user token) —
  // they have no session to redirect from in the first place. /api/health has no data at all, and
  // /api/app is the phone app's sign-in (it checks its own bearer tokens).
  const selfAuthorized = ["/api/cron", "/api/widget", "/api/health", "/api/app"].some((p) => pathname.startsWith(p));
  if (!signedIn && !isPublic && !selfAuthorized) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
