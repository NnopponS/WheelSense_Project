import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "ws_token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function maxAgeFromJwt(token: string): number {
  const payload = decodeJwtPayload(token);
  const exp =
    typeof payload?.exp === "number"
      ? payload.exp
      : typeof payload?.exp === "string"
        ? Number(payload.exp)
        : NaN;
  if (!Number.isFinite(exp)) return 60 * 60 * 24 * 7;
  return Math.max(0, Math.floor(exp - Date.now() / 1000));
}

/**
 * POST /api/mobile/set-session
 *
 * Called by the WheelSense mobile app WebView on page load when
 * window.__WHEELSENSE_MOBILE__ is true.  Accepts a JSON body
 * { token: string } and stores it in the HttpOnly ws_token cookie so
 * subsequent proxied requests are authenticated without requiring the
 * user to log in again through the web form.
 *
 * The token is validated by forwarding a /auth/session check to the
 * backend before the cookie is set.
 */
export async function POST(req: NextRequest) {
  let token: string;
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token.trim()) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    token = body.token.trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Validate token against the backend /auth/session endpoint
  const backendOrigin =
    process.env["WHEELSENSE_API_ORIGIN"] ??
    process.env["API_PROXY_TARGET"] ??
    "http://127.0.0.1:8000";

  let authenticated = false;
  try {
    const check = await fetch(`${backendOrigin}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (check.ok) {
      const data = (await check.json()) as { authenticated?: boolean };
      authenticated = data.authenticated === true;
    }
  } catch {
    return NextResponse.json({ error: "backend unreachable" }, { status: 502 });
  }

  if (!authenticated) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: maxAgeFromJwt(token),
  });
  return res;
}
