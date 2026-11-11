import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirects only (cookie presence, no database): pages verify the
 * session for real in src/server/auth/session.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(getSessionCookie(request));

  // /login is always reachable: a cookie may belong to a session that no longer
  // exists, and the login page itself sends users with a valid session to "/".
  if (pathname === "/login") return NextResponse.next();
  if (!hasSessionCookie) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the auth API, Next internals, static files and the icons and preview picture
  // that browsers and link previews (WhatsApp) fetch without signing in.
  matcher: [
    "/((?!api/|_next/|favicon\\.ico|(?:icon|apple-icon|opengraph-image)(?:$|/)|.*\\..*).*)",
  ],
};
