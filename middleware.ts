// middleware.ts (repo root)
import { NextResponse, NextRequest } from "next/server";

const SESSION_COOKIE = "session_token";

const PUBLIC_PATHS = ["/", "/login", "/forgot", "/reset", "/setup"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Let APIs handle their own auth
  if (pathname.startsWith("/api/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect non-public paths matched by config
  if (isPublicPath(pathname)) return NextResponse.next();

  // Coarse check: presence of our session cookie
  const hasSession = req.cookies.get(SESSION_COOKIE)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run middleware only where auth is required.
// Add other protected sections as needed.
export const config = {
  matcher: [
    "/dashboard/:path*", // protect dashboard
    // add more protected roots here, e.g. "/settings/:path*"
  ],
};
