import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  head_nurse: "/head-nurse",
  supervisor: "/supervisor",
  observer: "/observer",
  patient: "/patient",
};

function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(payload);
    const obj = JSON.parse(json) as { role?: string };
    return obj.role ?? null;
  } catch {
    return null;
  }
}

function pathAllowedForRole(pathname: string, role: string): boolean {
  if (role === "admin") return true;
  const prefix = Object.entries(ROLE_HOME).find(
    ([r, home]) => r === role && pathname.startsWith(home),
  );
  return !!prefix;
}

function redirectToLogin(request: NextRequest, targetPath: string, clearToken = false) {
  const login = new URL("/login", request.url);
  login.searchParams.set("next", targetPath);
  const response = NextResponse.redirect(login);
  if (clearToken) {
    response.cookies.set("ws_token", "", {
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nextPath = `${pathname}${request.nextUrl.search}`;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/login" ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("ws_token")?.value;
  if (!token) {
    return redirectToLogin(request, nextPath);
  }

  const role = decodeJwtRole(token);
  if (!role || !(role in ROLE_HOME)) {
    return redirectToLogin(request, nextPath, true);
  }

  if (!pathAllowedForRole(pathname, role)) {
    const home = ROLE_HOME[role] ?? "/login";
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/head-nurse/:path*",
    "/supervisor/:path*",
    "/observer/:path*",
    "/patient/:path*",
  ],
};
