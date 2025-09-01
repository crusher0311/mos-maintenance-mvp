// middleware.ts (at repo root)
import { NextResponse, NextRequest } from "next/server";

// Public, unauthenticated routes
const PUBLIC_PATHS = new Set(["/", "/login", "/forgot", "/reset", "/setup"]);

// Name of your session cookie (duplicate from lib/auth; don't import server-only code here)
const SESSION_COOKIE = "session_token";

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Let APIs and static assets handle their own auth / never block them here
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return false;
}

export function middleware(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;

    // Always allow public paths
    if (isPublicPath(pathname)) return NextResponse.next();

    // Require a session cookie for everything else
    const sid = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sid) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  } catch {
    // If anything goes wrong, do NOT brick the site—just continue
    return NextResponse.next();
  }
}

// Run on most paths, skipping Next static assets and common public files
export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml|public/).*)"],
};
