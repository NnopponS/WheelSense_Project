import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Upstream FastAPI (same default as former next.config rewrites). */
const BACKEND_ORIGIN =
  process.env.WHEELSENSE_API_ORIGIN ?? process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

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

async function proxyToBackend(req: NextRequest, pathSegments: string[] | undefined) {
  const sub = pathSegments?.length ? pathSegments.join("/") : "";
  const targetUrl = new URL(sub ? `/api/${sub}` : "/api", BACKEND_ORIGIN);
  targetUrl.search = req.nextUrl.searchParams.toString();

  const fwd = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP.has(lower) && lower !== "host") {
      fwd.set(key, value);
    }
  });

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

  const res = await fetch(targetUrl, init);

  const out = new Headers(res.headers);
  out.delete("transfer-encoding");

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyToBackend(req, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
