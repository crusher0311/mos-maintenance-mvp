// middleware.ts
import { NextResponse, NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/", "/login", "/forgot", "/reset", "/setup"]);
const SESSION_COOKIE = "session_token";

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return false;
}

export function middleware(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;
    if (isPublicPath(pathname)) return NextResponse.next();

    const sid = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sid) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml|public/).*)"],
};
