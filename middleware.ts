// middleware.ts
import { NextResponse, NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";

const PUBLIC_PATHS = new Set(["/", "/login", "/forgot", "/reset", "/setup", "/api/auth/login", "/api/auth/forgot", "/api/auth/reset", "/api/auth/complete-setup"]);
const SESSION_COOKIE = "session_token";

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/webhooks/")) return true; // webhooks should be public
  if (pathname.startsWith("/api/ping")) return true; // health checks
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return false;
}

async function validateSession(token: string): Promise<boolean> {
  try {
    const db = await getDb();
    const session = await db.collection("sessions").findOne({
      token,
      expiresAt: { $gt: new Date() },
    });
    return !!session;
  } catch (error) {
    console.error("Session validation error:", error);
    return false;
  }
}

export async function middleware(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;
    
    // Allow public paths
    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }

    // Check for session token
    const sid = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sid) {
      return redirectToLogin(req, pathname);
    }

    // Validate session in database for protected routes
    const isValidSession = await validateSession(sid);
    if (!isValidSession) {
      // Clear invalid session cookie
      const response = redirectToLogin(req, pathname);
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.next();
  }
}

function redirectToLogin(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

