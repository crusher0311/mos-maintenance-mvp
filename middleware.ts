// middleware.ts (at repo root)
import { NextResponse, NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/forgot", "/reset", "/setup"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Let APIs handle their own auth
  if (pathname.startsWith("/api/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  // Require a session cookie for everything else
  const sid = req.cookies.get("sid")?.value;
  if (!sid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run on most paths, skipping Next static assets and common public files
export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml|public/).*)"],
};
