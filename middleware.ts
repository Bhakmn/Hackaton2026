import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function middleware(request: NextRequest) {
  // Let Auth0 handle auth-specific routes (/auth/login, /auth/callback, etc.)
  const authRes = await auth0.middleware(request);

  const { pathname } = request.nextUrl;

  // Public paths — don't require authentication
  if (pathname === "/login" || pathname.startsWith("/auth/")) {
    return authRes;
  }

  // All other paths require a valid session
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return authRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|api/proxy|api/crawl-page).*)",
  ],
};
