import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const AUTH_COOKIE = "ws_token";
const IMPERSONATION_BACKUP_COOKIE = "ws_admin_token_backup";
const DEFAULT_AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Upstream FastAPI (same default as former next.config rewrites). */
function getBackendOrigin() {
  return (
    process.env["WHEELSENSE_API_ORIGIN"] ??
    process.env["API_PROXY_TARGET"] ??
    "http://127.0.0.1:8000"
  );
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function fallbackResponseForApiPath(pathname: string) {
  if (pathname === "settings/ai/copilot/models") {
    return NextResponse.json(
      {
        models: [],
        connected: false,
        message: "Copilot models are currently unavailable because the backend could not be reached.",
      },
      { status: 200 },
    );
  }

  if (pathname === "settings/ai/ollama/models") {
    return NextResponse.json(
      {
        models: [],
        reachable: false,
        origin: null,
        message: "Ollama models are currently unavailable because the backend could not be reached.",
      },
      { status: 200 },
    );
  }

  if (pathname === "settings/ai/copilot/status") {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  return null;
}

function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function authCookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
  };
}

function maxAgeFromJwt(token: string): number {
  const payload = decodeJwtPayload(token);
  const exp =
    typeof payload?.exp === "number"
      ? payload.exp
      : typeof payload?.exp === "string"
        ? Number(payload.exp)
        : NaN;
  if (!Number.isFinite(exp)) return DEFAULT_AUTH_MAX_AGE_SECONDS;
  return Math.max(0, Math.floor(exp - Date.now() / 1000));
}

function getCurrentSessionId(token: string | null): string | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.sid === "string" ? payload.sid : null;
}

function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_COOKIE, token, {
    ...authCookieBase(),
    maxAge: maxAgeFromJwt(token),
  });
}

function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", {
    ...authCookieBase(),
    maxAge: 0,
  });
}

function setImpersonationBackupCookie(response: NextResponse, token: string) {
  response.cookies.set(IMPERSONATION_BACKUP_COOKIE, token, {
    ...authCookieBase(),
    maxAge: maxAgeFromJwt(token),
  });
}

function clearImpersonationBackupCookie(response: NextResponse) {
  response.cookies.set(IMPERSONATION_BACKUP_COOKIE, "", {
    ...authCookieBase(),
    maxAge: 0,
  });
}

async function proxyToBackend(req: NextRequest, pathSegments: string[] | undefined) {
  const sub = pathSegments?.length ? pathSegments.join("/") : "";
  const incoming = req.nextUrl.pathname;
  /** Use the browser path (not `sub` alone) so a trailing slash is preserved. Rebuilding `/api/tasks/` from segments yields `/api/tasks`, which breaks POST bodies against Starlette/FastAPI slash handling. */
  let upstreamPath = incoming.startsWith("/api") ? incoming : sub ? `/api/${sub}` : "/api";
  if (req.method !== "GET" && req.method !== "HEAD" && upstreamPath === "/api/tasks") {
    upstreamPath = "/api/tasks/";
  }
  const targetUrl = new URL(upstreamPath, getBackendOrigin());
  targetUrl.search = req.nextUrl.searchParams.toString();

  const fwd = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP.has(lower) && lower !== "host" && lower !== "content-length" && lower !== "cookie") {
      fwd.set(key, value);
    }
  });

  const cookieToken = req.cookies.get(AUTH_COOKIE)?.value;
  if (!fwd.has("authorization") && cookieToken) {
    fwd.set("authorization", `Bearer ${cookieToken}`);
  }

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  const init: RequestInit = {
    method: req.method,
    headers: fwd,
  };
  if (body !== undefined && body.byteLength > 0) {
    init.body = body;
  }

  async function fetchWithTimeout() {
    return fetch(targetUrl, {
      ...init,
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
      next: { revalidate: 0 },
    });
  }

  let res: Response;
  try {
    res = await fetchWithTimeout();
  } catch (errorFirst) {
    // Brief retry on connection failures (startup jitter, Docker restarts, POST redirect edge cases).
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      res = await fetchWithTimeout();
    } catch (errorSecond) {
      console.error(
        "API proxy failed",
        targetUrl.toString(),
        errorFirst instanceof Error ? errorFirst.message : errorFirst,
      );
      const fallback = fallbackResponseForApiPath(sub);
      if (fallback) {
        return fallback;
      }
      return NextResponse.json(
        {
          detail: "Backend service is unavailable",
          backend_origin: getBackendOrigin(),
        },
        { status: 502 },
      );
    }
  }

  const out = new Headers(res.headers);
  out.delete("transfer-encoding");

  const response = new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
  response.headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("pragma", "no-cache");
  response.headers.set("expires", "0");

  if (res.status === 401) {
    clearAuthCookie(response);
  }

  return response;
}

async function handleAuthLogin(req: NextRequest, pathSegments: string[] | undefined) {
  const proxied = await proxyToBackend(req, pathSegments);
  if (proxied.status < 200 || proxied.status >= 300) {
    return proxied;
  }

  const cloned = proxied.clone();
  const body = (await cloned.json().catch(() => null)) as { access_token?: string } | null;
  if (body?.access_token) {
    setAuthCookie(proxied, body.access_token);
    clearImpersonationBackupCookie(proxied);
  }
  return proxied;
}

async function handleImpersonationStart(req: NextRequest, pathSegments: string[] | undefined) {
  const currentToken = req.cookies.get(AUTH_COOKIE)?.value ?? null;
  const proxied = await proxyToBackend(req, pathSegments);
  if (proxied.status < 200 || proxied.status >= 300) {
    return proxied;
  }

  const cloned = proxied.clone();
  const body = (await cloned.json().catch(() => null)) as { access_token?: string } | null;
  if (body?.access_token) {
    if (currentToken && !req.cookies.get(IMPERSONATION_BACKUP_COOKIE)?.value) {
      setImpersonationBackupCookie(proxied, currentToken);
    }
    setAuthCookie(proxied, body.access_token);
  }
  return proxied;
}

async function handleImpersonationStop(req: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  const backupToken = req.cookies.get(IMPERSONATION_BACKUP_COOKIE)?.value ?? null;
  if (backupToken) {
    setAuthCookie(response, backupToken);
  } else {
    clearAuthCookie(response);
  }
  clearImpersonationBackupCookie(response);
  return response;
}

async function handleAuthLogout(req: NextRequest, pathSegments: string[] | undefined) {
  let proxied: NextResponse | null = null;
  if (req.cookies.get(AUTH_COOKIE)?.value) {
    proxied = await proxyToBackend(req, pathSegments);
  }
  const response = proxied ?? new NextResponse(null, { status: 204 });
  clearAuthCookie(response);
  clearImpersonationBackupCookie(response);
  return response;
}

async function handleDeleteSession(req: NextRequest, pathSegments: string[] | undefined) {
  const proxied = await proxyToBackend(req, pathSegments);
  if (proxied.status < 200 || proxied.status >= 300) {
    return proxied;
  }

  const currentSessionId = getCurrentSessionId(req.cookies.get(AUTH_COOKIE)?.value ?? null);
  const targetSessionId = pathSegments?.[2] ?? null;
  if (currentSessionId && targetSessionId && currentSessionId === targetSessionId) {
    clearAuthCookie(proxied);
  }
  return proxied;
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  const sub = path?.length ? path.join("/") : "";

  if (req.method === "POST" && sub === "auth/login") {
    return handleAuthLogin(req, path);
  }
  if (req.method === "POST" && sub === "auth/logout") {
    return handleAuthLogout(req, path);
  }
  if (req.method === "POST" && sub === "auth/impersonate/start") {
    return handleImpersonationStart(req, path);
  }
  if (req.method === "POST" && sub === "auth/impersonate/stop") {
    return handleImpersonationStop(req);
  }
  if (req.method === "DELETE" && path?.[0] === "auth" && path?.[1] === "sessions" && path?.[2]) {
    return handleDeleteSession(req, path);
  }

  return proxyToBackend(req, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
